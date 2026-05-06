import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db, referenceAnswersTable, questionsTable, judgeModelsTable, judgeEvaluationsTable, settingsTable, datasetsTable } from "@workspace/db";
import type { MCQRefSections, OpenRefSections } from "@workspace/db";
import {
  callLLM,
  assembleMCQRefPrompt,
  assembleOpenRefPrompt,
  buildReferenceAnswerPrompt,
  type LLMProvider,
} from "../lib/llm";
import { resolvePromptSections } from "./prompts";
import { logger } from "../lib/logger";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

async function getUserSetting(userId: string, key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.userId, userId), eq(settingsTable.key, key)));
  return row?.value ?? null;
}

/** Run tasks with limited concurrency */
async function pLimit<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let i = 0;

  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// GET /reference-answers/status?datasetId=X[&judgeModelId=Y]
router.get("/reference-answers/status", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const datasetId = req.query.datasetId ? parseInt(req.query.datasetId as string) : null;
  if (!datasetId) { res.status(400).json({ error: "datasetId required" }); return; }

  let judgeModelId: number;
  if (req.query.judgeModelId) {
    judgeModelId = parseInt(req.query.judgeModelId as string);
  } else {
    const judgeModelIdStr = await getUserSetting(uid, "judge_model_id");
    if (!judgeModelIdStr) {
      res.json({ total: 0, covered: 0, judgeModelId: null });
      return;
    }
    judgeModelId = parseInt(judgeModelIdStr);
  }

  const questions = await db.select({ id: questionsTable.id })
    .from(questionsTable)
    .where(eq(questionsTable.datasetId, datasetId));
  const total = questions.length;

  if (total === 0) {
    res.json({ total: 0, covered: 0, judgeModelId });
    return;
  }

  const questionIds = questions.map((q) => q.id);

  const refs = await db.select({ id: referenceAnswersTable.id })
    .from(referenceAnswersTable)
    .where(and(
      eq(referenceAnswersTable.judgeModelId, judgeModelId),
      inArray(referenceAnswersTable.questionId, questionIds)
    ));

  res.json({ total, covered: refs.length, judgeModelId });
});

// POST /reference-answers/generate
// Body: { datasetId, judgeModelId?, questionIds?, mcqPromptId?, openPromptId? }
router.post("/reference-answers/generate", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  try {
    const {
      datasetId,
      judgeModelId: bodyJudgeModelId,
      questionIds: specificIds,
      mcqPromptId,
      openPromptId,
    } = req.body as {
      datasetId?: number;
      judgeModelId?: number;
      questionIds?: number[];
      mcqPromptId?: string;
      openPromptId?: string;
    };

    if (!datasetId) { res.status(400).json({ error: "datasetId required" }); return; }

    // Validate prompt IDs (if not system defaults, must exist in DB and belong to user)
    if (mcqPromptId && !mcqPromptId.startsWith("system_")) {
      const sections = await resolvePromptSections(mcqPromptId, "MCQ_REFERENCE");
      if (!sections) {
        res.status(400).json({ error: "MCQ prompt not found or wrong type" });
        return;
      }
    }
    if (openPromptId && !openPromptId.startsWith("system_")) {
      const sections = await resolvePromptSections(openPromptId, "OPEN_REFERENCE");
      if (!sections) {
        res.status(400).json({ error: "Open-ended prompt not found or wrong type" });
        return;
      }
    }

    // Resolve judge model and version
    let judgeModelId: number;
    let modelVersion: string | null;

    if (bodyJudgeModelId) {
      judgeModelId = bodyJudgeModelId;
      modelVersion = await getUserSetting(uid, `judge_model_version_${judgeModelId}`);
      if (!modelVersion) {
        modelVersion = await getUserSetting(uid, "judge_model_version");
      }
    } else {
      const judgeModelIdStr = await getUserSetting(uid, "judge_model_id");
      modelVersion = await getUserSetting(uid, "judge_model_version");
      if (!judgeModelIdStr || !modelVersion) {
        res.status(400).json({ error: "No judge model configured. Please configure one in Settings." });
        return;
      }
      judgeModelId = parseInt(judgeModelIdStr);
    }

    if (!modelVersion) {
      res.status(400).json({ error: "No model version found for this judge model. Please save it in Settings first." });
      return;
    }

    const [judgeModel] = await db.select().from(judgeModelsTable).where(eq(judgeModelsTable.id, judgeModelId));
    if (!judgeModel) { res.status(404).json({ error: "Judge model not found" }); return; }

    // Get API key
    const keyMap: Record<string, string> = {
      OpenAI:   "openai_api_key",
      Gemini:   "gemini_api_key",
      Claude:   "claude_api_key",
      DeepSeek: "deepseek_api_key",
    };
    const apiKey = await getUserSetting(uid, keyMap[judgeModel.provider] ?? "");
    if (!apiKey) {
      res.status(400).json({ error: `${judgeModel.provider} API key not configured in your settings.` });
      return;
    }

    // Resolve prompt sections once (reused for all questions of that type)
    const mcqSections = (await resolvePromptSections(mcqPromptId ?? null, "MCQ_REFERENCE")) as MCQRefSections | null;
    const openSections = (await resolvePromptSections(openPromptId ?? null, "OPEN_REFERENCE")) as OpenRefSections | null;

    // Fetch questions
    let questions: typeof questionsTable.$inferSelect[] = [];
    if (specificIds && specificIds.length > 0) {
      questions = await db.select().from(questionsTable)
        .where(and(eq(questionsTable.datasetId, datasetId), inArray(questionsTable.id, specificIds)));
    } else {
      questions = await db.select().from(questionsTable)
        .where(eq(questionsTable.datasetId, datasetId));
    }

    if (questions.length === 0) {
      res.json({ generated: 0, skipped: 0, errors: ["No questions found in dataset"] });
      return;
    }

    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];

    const tasks = questions.map((q) => async () => {
      try {
        const meta = (q.metadata as Record<string, unknown>) ?? {};
        let prompt: string;
        let usedPromptId: string;

        if (q.questionType === "MCQ") {
          prompt = mcqSections
            ? assembleMCQRefPrompt(mcqSections, q.questionText, meta)
            : buildReferenceAnswerPrompt(q.questionText, q.questionType, meta);
          usedPromptId = mcqPromptId ?? "system_mcq_reference";
        } else {
          prompt = openSections
            ? assembleOpenRefPrompt(openSections, q.questionText)
            : buildReferenceAnswerPrompt(q.questionText, q.questionType, meta);
          usedPromptId = openPromptId ?? "system_open_reference";
        }

        const { text, confirmedModel } = await callLLM(
          judgeModel.provider as LLMProvider,
          modelVersion!,
          prompt,
          apiKey
        );

        await db
          .insert(referenceAnswersTable)
          .values({
            questionId: q.id,
            judgeModelId,
            answerText: text.trim(),
            modelVersion: modelVersion!,
            confirmedModel: confirmedModel ?? modelVersion!,
            createdBy: uid,
            promptId: usedPromptId,
          })
          .onConflictDoUpdate({
            target: [referenceAnswersTable.questionId, referenceAnswersTable.judgeModelId],
            set: {
              answerText:     sql`excluded.answer_text`,
              modelVersion:   sql`excluded.model_version`,
              confirmedModel: sql`excluded.confirmed_model`,
              generatedAt:    sql`NOW()`,
              createdBy:      sql`excluded.created_by`,
              promptId:       sql`excluded.prompt_id`,
            },
          });

        generated++;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.error({ error: errMsg, questionId: q.id }, "Failed to generate reference answer");
        skipped++;
        errors.push(`Q${q.id}: ${errMsg}`);
      }
    });

    await pLimit(tasks, 4);

    const [dataset] = await db.select({ datasetName: datasetsTable.datasetName })
      .from(datasetsTable).where(eq(datasetsTable.id, datasetId));

    await logActivity(req, {
      action: "GEN_REFERENCE",
      entityType: "reference",
      entityName: judgeModel.displayName,
      details: `Generated ${generated} reference answers using "${judgeModel.displayName} · ${modelVersion}" on dataset "${dataset?.datasetName ?? datasetId}" (${skipped} failed)`,
    });

    res.json({ generated, skipped, errors });

  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    logger.error({ error: errMsg }, "Unhandled error in /reference-answers/generate");
    res.status(500).json({ error: `Server error: ${errMsg}` });
  }
});

export default router;
