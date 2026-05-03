import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db, referenceAnswersTable, questionsTable, judgeModelsTable, judgeEvaluationsTable, settingsTable } from "@workspace/db";
import { callLLM, buildReferenceAnswerPrompt, type LLMProvider } from "../lib/llm";
import { logger } from "../lib/logger";

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

// GET /reference-answers/status?datasetId=X[&judgeModelId=Y]
// Returns how many questions in the dataset have reference answers for the given (or saved) judge model
router.get("/reference-answers/status", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const datasetId = req.query.datasetId ? parseInt(req.query.datasetId as string) : null;
  if (!datasetId) { res.status(400).json({ error: "datasetId required" }); return; }

  // Prefer explicitly passed judgeModelId, fall back to user's saved setting
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

  // Count total questions in dataset
  const questions = await db.select({ id: questionsTable.id })
    .from(questionsTable)
    .where(eq(questionsTable.datasetId, datasetId));
  const total = questions.length;

  if (total === 0) {
    res.json({ total: 0, covered: 0, judgeModelId });
    return;
  }

  const questionIds = questions.map((q) => q.id);

  // Count how many have reference answers
  const refs = await db.select({ id: referenceAnswersTable.id })
    .from(referenceAnswersTable)
    .where(and(
      eq(referenceAnswersTable.judgeModelId, judgeModelId),
      inArray(referenceAnswersTable.questionId, questionIds)
    ));

  res.json({ total, covered: refs.length, judgeModelId });
});

// POST /reference-answers/generate
// Body: { datasetId: number, judgeModelId?: number, questionIds?: number[] }
router.post("/reference-answers/generate", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const { datasetId, judgeModelId: bodyJudgeModelId, questionIds: specificIds } = req.body as {
    datasetId?: number;
    judgeModelId?: number;
    questionIds?: number[];
  };

  if (!datasetId) { res.status(400).json({ error: "datasetId required" }); return; }

  // Prefer explicitly passed judgeModelId, fall back to user's saved setting
  let judgeModelId: number;
  let modelVersion: string | null;

  if (bodyJudgeModelId) {
    judgeModelId = bodyJudgeModelId;
    modelVersion = await getUserSetting(uid, `judge_model_version_${judgeModelId}`);
    if (!modelVersion) {
      // Fall back to the global saved version if per-provider not found
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

  // Get API key for the judge model provider
  const keyMap: Record<string, string> = {
    OpenAI: "openai_api_key",
    Gemini: "gemini_api_key",
    Claude: "claude_api_key",
    DeepSeek: "deepseek_api_key",
  };
  const apiKey = await getUserSetting(uid, keyMap[judgeModel.provider] ?? "");
  if (!apiKey) {
    res.status(400).json({ error: `${judgeModel.provider} API key not configured in your settings.` });
    return;
  }

  // Fetch questions for this dataset
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

  for (const q of questions) {
    try {
      const prompt = buildReferenceAnswerPrompt(
        q.questionText,
        q.questionType,
        (q.metadata as Record<string, unknown>) ?? {}
      );

      const { text, confirmedModel } = await callLLM(
        judgeModel.provider as LLMProvider,
        modelVersion,
        prompt,
        apiKey
      );

      // Upsert reference answer (replace if already exists)
      await db
        .insert(referenceAnswersTable)
        .values({
          questionId: q.id,
          judgeModelId,
          answerText: text.trim(),
          modelVersion,
          confirmedModel: confirmedModel ?? modelVersion,
          createdBy: uid,
        })
        .onConflictDoUpdate({
          target: [referenceAnswersTable.questionId, referenceAnswersTable.judgeModelId],
          set: {
            answerText: sql`excluded.answer_text`,
            modelVersion: sql`excluded.model_version`,
            confirmedModel: sql`excluded.confirmed_model`,
            generatedAt: sql`NOW()`,
            createdBy: sql`excluded.created_by`,
          },
        });

      generated++;
    } catch (e) {
      logger.error({ error: String(e), questionId: q.id }, "Failed to generate reference answer");
      skipped++;
      errors.push(`Question ${q.id}: ${String(e)}`);
    }
  }

  res.json({ generated, skipped, errors });
});

export default router;
