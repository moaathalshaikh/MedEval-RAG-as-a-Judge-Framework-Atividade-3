import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, judgeEvaluationsTable, modelResponsesTable, modelsTable, questionsTable, judgeModelsTable, settingsTable } from "@workspace/db";
import {
  RunJudgeBody,
  GetEvaluationParams,
  ListEvaluationsQueryParams,
} from "@workspace/api-zod";
import { callLLM, buildJudgePrompt, parseJudgeResponse, type LLMProvider } from "../lib/llm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const JUDGE_MODEL_KEY = "judge_model_id";

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
  };
}

router.get("/evaluations", async (req, res): Promise<void> => {
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

router.post("/evaluations/run", async (req, res): Promise<void> => {
  const parsed = RunJudgeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { judgeModelId, responseIds, datasetId, modelId } = parsed.data;

  // Resolve judge model: use provided judgeModelId or fall back to saved setting
  let resolvedJudgeModelId = judgeModelId;
  if (!resolvedJudgeModelId) {
    const [setting] = await db.select().from(settingsTable).where(eq(settingsTable.key, JUDGE_MODEL_KEY));
    if (setting?.value) resolvedJudgeModelId = parseInt(setting.value);
  }

  if (!resolvedJudgeModelId) {
    res.status(400).json({ error: "No judge model configured. Please select one in Settings." });
    return;
  }

  const [judgeModel] = await db.select().from(judgeModelsTable).where(eq(judgeModelsTable.id, resolvedJudgeModelId));
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
        .select({
          response: modelResponsesTable,
          question: questionsTable,
          model: modelsTable,
        })
        .from(modelResponsesTable)
        .leftJoin(questionsTable, eq(questionsTable.id, modelResponsesTable.questionId))
        .leftJoin(modelsTable, eq(modelsTable.id, modelResponsesTable.modelId))
        .where(eq(modelResponsesTable.id, rid));
      if (row) responseRows.push(row as typeof responseRows[0]);
    }
  } else {
    const conditions = [];
    if (datasetId != null) {
      const allQ = await db.select().from(questionsTable).where(eq(questionsTable.datasetId, datasetId));
      const qIds = allQ.map((q) => q.id);
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
        (modelId == null || r.response.modelId === modelId)
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
  }

  let evaluated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const { response, question, model } of responseRows) {
    if (!question) {
      skipped++;
      errors.push(`Response ${response.id}: question not found`);
      continue;
    }

    try {
      const prompt = buildJudgePrompt(
        question.questionText,
        question.goldAnswer,
        response.responseText,
        question.questionType,
        (question.metadata as Record<string, unknown>) ?? {}
      );

      const { text } = await callLLM(
        judgeModel.provider as LLMProvider,
        judgeModel.modelVersion,
        prompt
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
      });

      evaluated++;
    } catch (e) {
      logger.error({ error: String(e), responseId: response.id }, "Judge evaluation failed");
      skipped++;
      errors.push(`Response ${response.id}: ${String(e)}`);
    }
  }

  res.json({ evaluated, skipped, errors });
});

router.get("/evaluations/:id", async (req, res): Promise<void> => {
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

export default router;
