import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db, judgeEvaluationsTable, modelResponsesTable, modelsTable, questionsTable, judgeModelsTable, settingsTable, referenceAnswersTable } from "@workspace/db";
import { logActivity } from "../lib/activity";
import {
  RunJudgeBody,
  GetEvaluationParams,
  ListEvaluationsQueryParams,
} from "@workspace/api-zod";
import { callLLM, assembleEvalPrompt, buildJudgePrompt, parseJudgeResponse, scoreMCQDeterministic, type LLMProvider } from "../lib/llm";
import { resolvePromptSections } from "./prompts";
import type { EvalSections } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const JUDGE_MODEL_ID_KEY = "judge_model_id";
const JUDGE_MODEL_VERSION_KEY = "judge_model_version";

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

function formatEval(e: typeof judgeEvaluationsTable.$inferSelect, extras?: {
  questionText?: string | null;
  responseText?: string | null;
  modelName?: string | null;
  judgeModelName?: string | null;
}) {
  return {
    id: e.id,
    responseId: e.responseId,
    judgeModelId: e.judgeModelId,
    score: e.score,
    reasoning: e.reasoning,
    evaluatedAt: e.evaluatedAt.toISOString(),
    questionText: extras?.questionText ?? null,
    responseText: extras?.responseText ?? null,
    modelName: extras?.modelName ?? null,
    judgeModelName: extras?.judgeModelName ?? null,
    judgeModelVersion: e.judgeModelVersion ?? null,
    confirmedModel: e.confirmedModel ?? null,
  };
}

router.get("/evaluations", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const parsed = ListEvaluationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [];
  if (parsed.data.responseId != null) conditions.push(eq(judgeEvaluationsTable.responseId, parsed.data.responseId));
  if (parsed.data.judgeModelId != null) conditions.push(eq(judgeEvaluationsTable.judgeModelId, parsed.data.judgeModelId));

  const rows = await db
    .select({
      evaluation: judgeEvaluationsTable,
      questionText: questionsTable.questionText,
      responseText: modelResponsesTable.responseText,
      modelName: modelsTable.modelName,
    })
    .from(judgeEvaluationsTable)
    .leftJoin(modelResponsesTable, eq(modelResponsesTable.id, judgeEvaluationsTable.responseId))
    .leftJoin(questionsTable, eq(questionsTable.id, modelResponsesTable.questionId))
    .leftJoin(modelsTable, eq(modelsTable.id, modelResponsesTable.modelId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(judgeEvaluationsTable.evaluatedAt);

  const allJudgeModels = await db.select().from(judgeModelsTable);
  const judgeMap = new Map(allJudgeModels.map((m) => [m.id, m.displayName]));

  res.json(rows.map((row) => formatEval(row.evaluation, {
    questionText: row.questionText,
    responseText: row.responseText,
    modelName: row.modelName,
    judgeModelName: judgeMap.get(row.evaluation.judgeModelId) ?? null,
  })));
});

router.post("/evaluations/run", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const parsed = RunJudgeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { judgeModelId, responseIds, datasetId, modelId } = parsed.data;
  const useReferenceAnswers = !!(req.body as Record<string, unknown>).useReferenceAnswers;
  const evalPromptId = (req.body as Record<string, unknown>).evalPromptId as string | undefined;
  const questionIds = (req.body as Record<string, unknown>).questionIds as number[] | undefined;
  // ragFilter: "all" (default) | "baseline" (rag_enabled=false) | "rag" (rag_enabled=true)
  const ragFilter = ((req.body as Record<string, unknown>).ragFilter as string | undefined) ?? "all";

  // Resolve judge model from user settings
  let resolvedJudgeModelId = judgeModelId;
  let resolvedModelVersion: string | null = null;

  if (!resolvedJudgeModelId) {
    const storedId = await getUserSetting(uid, JUDGE_MODEL_ID_KEY);
    if (storedId) resolvedJudgeModelId = parseInt(storedId);
  }
  resolvedModelVersion = await getUserSetting(uid, JUDGE_MODEL_VERSION_KEY);

  // For MCQ-only datasets no LLM call is needed — fall back to the first available judge model
  // just to satisfy the DB foreign-key requirement when storing auto-graded results.
  const allJudgeModelsForFallback = await db.select().from(judgeModelsTable);
  if (!resolvedJudgeModelId || !resolvedModelVersion) {
    const fallback = allJudgeModelsForFallback[0];
    if (!fallback) {
      res.status(400).json({ error: "No judge model configured. Please add at least one in Settings." });
      return;
    }
    resolvedJudgeModelId = fallback.id;
    resolvedModelVersion = resolvedModelVersion ?? "auto-graded";
  }

  const judgeModel = allJudgeModelsForFallback.find((m) => m.id === resolvedJudgeModelId);
  if (!judgeModel) {
    res.status(404).json({ error: "Judge model not found" });
    return;
  }

  // Get responses to evaluate
  let responseRows: Array<{
    response: typeof modelResponsesTable.$inferSelect;
    question: typeof questionsTable.$inferSelect | null;
    model: typeof modelsTable.$inferSelect | null;
  }> = [];

  if (responseIds && responseIds.length > 0) {
    for (const rid of responseIds) {
      const [row] = await db
        .select({ response: modelResponsesTable, question: questionsTable, model: modelsTable })
        .from(modelResponsesTable)
        .leftJoin(questionsTable, eq(questionsTable.id, modelResponsesTable.questionId))
        .leftJoin(modelsTable, eq(modelsTable.id, modelResponsesTable.modelId))
        .where(eq(modelResponsesTable.id, rid));
      if (row) responseRows.push(row as typeof responseRows[0]);
    }
  } else if (datasetId != null) {
    const allQ = await db
      .select()
      .from(questionsTable)
      .where(eq(questionsTable.datasetId, datasetId))
      .orderBy(questionsTable.createdAt);
    // If caller provided a questionIds slice, restrict to those; otherwise use all
    const qIds = questionIds && questionIds.length > 0
      ? allQ.map((q) => q.id).filter((id) => questionIds.includes(id))
      : allQ.map((q) => q.id);
    if (qIds.length === 0) {
      res.json({ evaluated: 0, skipped: 0, errors: ["No questions in dataset"] });
      return;
    }
    const allResponses = await db
      .select({ response: modelResponsesTable, question: questionsTable, model: modelsTable })
      .from(modelResponsesTable)
      .leftJoin(questionsTable, eq(questionsTable.id, modelResponsesTable.questionId))
      .leftJoin(modelsTable, eq(modelsTable.id, modelResponsesTable.modelId));
    responseRows = allResponses.filter((r) =>
      r.question && qIds.includes(r.question.id) &&
      (modelId == null || r.response.modelId === modelId) &&
      (ragFilter === "all" || (ragFilter === "rag" ? r.response.ragEnabled === true : r.response.ragEnabled !== true))
    ) as typeof responseRows;
  } else if (modelId != null) {
    const allResponses = await db
      .select({ response: modelResponsesTable, question: questionsTable, model: modelsTable })
      .from(modelResponsesTable)
      .leftJoin(questionsTable, eq(questionsTable.id, modelResponsesTable.questionId))
      .leftJoin(modelsTable, eq(modelsTable.id, modelResponsesTable.modelId))
      .where(eq(modelResponsesTable.modelId, modelId));
    responseRows = allResponses as typeof responseRows;
  } else {
    const allResponses = await db
      .select({ response: modelResponsesTable, question: questionsTable, model: modelsTable })
      .from(modelResponsesTable)
      .leftJoin(questionsTable, eq(questionsTable.id, modelResponsesTable.questionId))
      .leftJoin(modelsTable, eq(modelsTable.id, modelResponsesTable.modelId));
    responseRows = allResponses as typeof responseRows;
  }

  // Check whether any open-ended questions exist (only those require the LLM/API key)
  const hasOpenEnded = responseRows.some((r) => r.question?.questionType === "OPEN_ENDED");

  const keyMap: Record<string, string> = {
    OpenAI: "openai_api_key",
    Gemini: "gemini_api_key",
    Claude: "claude_api_key",
    DeepSeek: "deepseek_api_key",
  };
  let apiKey: string | null = null;
  if (hasOpenEnded) {
    apiKey = await getUserSetting(uid, keyMap[judgeModel.provider] ?? "");
    if (!apiKey) {
      res.status(400).json({ error: `${judgeModel.provider} API key not configured in your settings. Required for open-ended question evaluation.` });
      return;
    }
  }

  // Resolve evaluation prompt sections once
  const evalSections = (await resolvePromptSections(evalPromptId ?? null, "EVALUATION")) as EvalSections | null;

  // Pre-fetch all reference answers if needed (bulk fetch for performance)
  let refAnswerMap: Map<number, string> = new Map();
  if (useReferenceAnswers) {
    const questionIds = [...new Set(responseRows.map((r) => r.question?.id).filter(Boolean) as number[])];
    if (questionIds.length > 0) {
      const refs = await db
        .select()
        .from(referenceAnswersTable)
        .where(and(
          eq(referenceAnswersTable.judgeModelId, resolvedJudgeModelId!),
          inArray(referenceAnswersTable.questionId, questionIds)
        ));
      for (const ref of refs) {
        refAnswerMap.set(ref.questionId, ref.answerText);
      }
    }
  }

  // Pre-fetch already-evaluated response IDs for this judge model to avoid duplicates
  const alreadyEvaluated = new Set(
    (await db
      .select({ responseId: judgeEvaluationsTable.responseId })
      .from(judgeEvaluationsTable)
      .where(eq(judgeEvaluationsTable.judgeModelId, resolvedJudgeModelId!))
    ).map((r) => r.responseId)
  );

  let evaluated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const { response, question } of responseRows) {
    // Skip if this response was already evaluated by the same judge model
    if (alreadyEvaluated.has(response.id)) {
      skipped++;
      continue;
    }
    if (!question) {
      skipped++;
      errors.push(`Response ${response.id}: question not found`);
      continue;
    }

    try {
      // ── MCQ: deterministic auto-grading — no LLM call needed ──────────────
      if (question.questionType === "MCQ") {
        const { score, reasoning, confirmedModel } = scoreMCQDeterministic(
          response.responseText,
          question.goldAnswer
        );

        await db.insert(judgeEvaluationsTable).values({
          responseId: response.id,
          judgeModelId: resolvedJudgeModelId!,
          score,
          reasoning,
          judgeModelVersion: "auto-graded",
          confirmedModel,
          createdBy: uid,
        });

        evaluated++;
        continue;
      }

      // ── Open-ended: LLM-as-a-Judge ────────────────────────────────────────
      const referenceAnswer = useReferenceAnswers ? refAnswerMap.get(question.id) : undefined;

      if (useReferenceAnswers && !referenceAnswer) {
        skipped++;
        errors.push(`Response ${response.id}: no reference answer for question ${question.id} — run Step 1 first`);
        continue;
      }

      const prompt = evalSections
        ? assembleEvalPrompt(
            evalSections,
            question.questionText,
            question.goldAnswer,
            response.responseText,
            (question.metadata as Record<string, unknown>) ?? {},
            referenceAnswer
          )
        : buildJudgePrompt(
            question.questionText,
            question.goldAnswer,
            response.responseText,
            (question.metadata as Record<string, unknown>) ?? {},
            referenceAnswer
          );

      const { text, confirmedModel } = await callLLM(
        judgeModel.provider as LLMProvider,
        resolvedModelVersion!,
        prompt,
        apiKey!
      );

      const result = parseJudgeResponse(text);
      if (!result) {
        skipped++;
        errors.push(`Response ${response.id}: failed to parse judge output`);
        continue;
      }

      await db.insert(judgeEvaluationsTable).values({
        responseId: response.id,
        judgeModelId: resolvedJudgeModelId!,
        score: result.score,
        reasoning: result.reasoning,
        judgeModelVersion: resolvedModelVersion,
        confirmedModel: confirmedModel ?? resolvedModelVersion,
        createdBy: uid,
        promptId: evalPromptId ?? "system_evaluation",
      });

      evaluated++;
    } catch (e) {
      logger.error({ error: String(e), responseId: response.id }, "Judge evaluation failed");
      skipped++;
      errors.push(`Response ${response.id}: ${String(e)}`);
    }
  }

  await logActivity(req, { action: "RUN_EVALUATION", entityType: "evaluation", entityName: judgeModel.displayName, details: `Ran judge evaluation: ${evaluated} evaluated, ${skipped} skipped using "${judgeModel.displayName} (${resolvedModelVersion})"` });
  res.json({ evaluated, skipped, errors });
});

router.delete("/evaluations/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.select().from(judgeEvaluationsTable).where(eq(judgeEvaluationsTable.id, id));
  if (!row) { res.status(404).json({ error: "Evaluation not found" }); return; }

  // Ownership check: if createdBy is set, only the creator can clear it
  if (row.createdBy !== null && row.createdBy !== uid) {
    res.status(403).json({ error: "You can only clear evaluations you ran" });
    return;
  }

  await logActivity(req, { action: "DELETE_EVALUATION", entityType: "evaluation", entityName: `Evaluation #${id}`, details: `Deleted evaluation #${id}` });
  await db.delete(judgeEvaluationsTable).where(eq(judgeEvaluationsTable.id, id));
  res.json({ deleted: true });
});

// ── GET /evaluations/pending-count ────────────────────────────────────────────
// Returns how many responses are pending evaluation (not yet evaluated by this judge).
router.get("/evaluations/pending-count", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const datasetId  = req.query.datasetId  ? parseInt(req.query.datasetId  as string) : undefined;
  const modelId    = req.query.modelId    ? parseInt(req.query.modelId    as string) : undefined;
  const judgeModelId = req.query.judgeModelId ? parseInt(req.query.judgeModelId as string) : undefined;
  const ragFilter  = (req.query.ragFilter as string | undefined) ?? "all";

  if (!datasetId) { res.status(400).json({ error: "datasetId required" }); return; }

  // Get all response IDs for this dataset (+ optional model + ragFilter)
  const allResponses = await db
    .select({ id: modelResponsesTable.id, ragEnabled: modelResponsesTable.ragEnabled, modelId: modelResponsesTable.modelId })
    .from(modelResponsesTable)
    .leftJoin(questionsTable, eq(questionsTable.id, modelResponsesTable.questionId))
    .where(eq(questionsTable.datasetId, datasetId));

  const filtered = allResponses.filter((r) => {
    if (modelId != null && r.modelId !== modelId) return false;
    if (ragFilter === "rag")      return r.ragEnabled === true;
    if (ragFilter === "baseline") return r.ragEnabled !== true;
    return true;
  });

  const total = filtered.length;

  if (total === 0 || !judgeModelId) {
    res.json({ total, alreadyEvaluated: 0, pending: total });
    return;
  }

  const responseIds = filtered.map((r) => r.id);
  const evaluated = await db
    .select({ responseId: judgeEvaluationsTable.responseId })
    .from(judgeEvaluationsTable)
    .where(and(
      eq(judgeEvaluationsTable.judgeModelId, judgeModelId),
      inArray(judgeEvaluationsTable.responseId, responseIds)
    ));

  const alreadyEvaluated = new Set(evaluated.map((e) => e.responseId)).size;
  res.json({ total, alreadyEvaluated, pending: total - alreadyEvaluated });
});

router.get("/evaluations/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = GetEvaluationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select({
      evaluation: judgeEvaluationsTable,
      questionText: questionsTable.questionText,
      responseText: modelResponsesTable.responseText,
      modelName: modelsTable.modelName,
    })
    .from(judgeEvaluationsTable)
    .leftJoin(modelResponsesTable, eq(modelResponsesTable.id, judgeEvaluationsTable.responseId))
    .leftJoin(questionsTable, eq(questionsTable.id, modelResponsesTable.questionId))
    .leftJoin(modelsTable, eq(modelsTable.id, modelResponsesTable.modelId))
    .where(eq(judgeEvaluationsTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Evaluation not found" });
    return;
  }

  const [judgeModel] = await db.select().from(judgeModelsTable).where(eq(judgeModelsTable.id, row.evaluation.judgeModelId));
  res.json(formatEval(row.evaluation, {
    questionText: row.questionText,
    responseText: row.responseText,
    modelName: row.modelName,
    judgeModelName: judgeModel?.displayName ?? null,
  }));
});

// ── GET /evaluations/model-progress ───────────────────────────────────────────
// Per-model evaluation progress from DB for a given dataset + question type.
router.get("/evaluations/model-progress", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const datasetId = req.query.datasetId ? parseInt(req.query.datasetId as string) : undefined;
  if (!datasetId || isNaN(datasetId)) {
    res.status(400).json({ error: "datasetId required" });
    return;
  }

  const questionType = (req.query.questionType as string | undefined) ?? "OPEN_ENDED";
  const ragFilter    = (req.query.ragFilter as string | undefined) ?? "baseline";
  const ragEnabled   = ragFilter === "rag" ? true : ragFilter === "baseline" ? false : null;

  type ProgressRow = { model_id: number; model_name: string; total: number; evaluated: number };

  let rows: ProgressRow[] = [];
  try {
    const r = ragEnabled === null
      ? await db.execute(sql`
          SELECT m.id_model AS model_id, m.model_name,
            COUNT(DISTINCT mr.id_response)::int AS total,
            COUNT(DISTINCT je.id_response)::int AS evaluated
          FROM models m
          JOIN model_responses mr ON mr.id_model = m.id_model
          JOIN questions q ON q.id_question = mr.id_question
          LEFT JOIN judge_evaluations je ON je.id_response = mr.id_response
          WHERE q.dataset_id = ${datasetId} AND q.question_type = ${questionType}
          GROUP BY m.id_model, m.model_name ORDER BY evaluated ASC, m.model_name`)
      : await db.execute(sql`
          SELECT m.id_model AS model_id, m.model_name,
            COUNT(DISTINCT mr.id_response)::int AS total,
            COUNT(DISTINCT je.id_response)::int AS evaluated
          FROM models m
          JOIN model_responses mr ON mr.id_model = m.id_model
          JOIN questions q ON q.id_question = mr.id_question
          LEFT JOIN judge_evaluations je ON je.id_response = mr.id_response
          WHERE q.dataset_id = ${datasetId} AND q.question_type = ${questionType}
            AND mr.rag_enabled = ${ragEnabled}
          GROUP BY m.id_model, m.model_name ORDER BY evaluated ASC, m.model_name`);
    rows = r.rows as ProgressRow[];
  } catch (e) {
    logger.error({ error: String(e) }, "model-progress query failed");
    res.status(500).json({ error: "Query failed" });
    return;
  }

  res.json(rows.map((row) => ({
    modelId:   Number(row.model_id),
    modelName: String(row.model_name),
    total:     Number(row.total),
    evaluated: Number(row.evaluated),
    pending:   Number(row.total) - Number(row.evaluated),
  })));
});

export default router;
