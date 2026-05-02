import { Router, type IRouter } from "express";
import { eq, and, avg, count, sql } from "drizzle-orm";
import {
  db,
  modelsTable,
  datasetsTable,
  questionsTable,
  modelResponsesTable,
  judgeEvaluationsTable,
} from "@workspace/db";
import { GetResultsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/analytics/summary", async (_req, res): Promise<void> => {
  const [modelCount] = await db.select({ count: count() }).from(modelsTable);
  const [datasetCount] = await db.select({ count: count() }).from(datasetsTable);
  const [questionCount] = await db.select({ count: count() }).from(questionsTable);
  const [responseCount] = await db.select({ count: count() }).from(modelResponsesTable);
  const [evalCount] = await db.select({ count: count() }).from(judgeEvaluationsTable);
  const [avgScore] = await db.select({ avg: avg(judgeEvaluationsTable.score) }).from(judgeEvaluationsTable);
  const [mcqCount] = await db.select({ count: count() }).from(questionsTable).where(eq(questionsTable.questionType, "MCQ"));
  const [openCount] = await db.select({ count: count() }).from(questionsTable).where(eq(questionsTable.questionType, "OPEN_ENDED"));

  res.json({
    totalModels: Number(modelCount?.count ?? 0),
    totalDatasets: Number(datasetCount?.count ?? 0),
    totalQuestions: Number(questionCount?.count ?? 0),
    totalResponses: Number(responseCount?.count ?? 0),
    totalEvaluations: Number(evalCount?.count ?? 0),
    averageScore: avgScore?.avg != null ? Number(avgScore.avg) : null,
    mcqCount: Number(mcqCount?.count ?? 0),
    openEndedCount: Number(openCount?.count ?? 0),
  });
});

router.get("/analytics/model-comparison", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      modelId: modelsTable.id,
      modelName: modelsTable.modelName,
      provider: modelsTable.provider,
      avgScore: avg(judgeEvaluationsTable.score),
      totalEvaluations: count(judgeEvaluationsTable.id),
      totalResponses: sql<number>`cast(count(distinct ${modelResponsesTable.id}) as integer)`,
      avgInferenceMs: avg(modelResponsesTable.inferenceTimeMs),
    })
    .from(modelsTable)
    .leftJoin(modelResponsesTable, eq(modelResponsesTable.modelId, modelsTable.id))
    .leftJoin(judgeEvaluationsTable, eq(judgeEvaluationsTable.responseId, modelResponsesTable.id))
    .groupBy(modelsTable.id)
    .orderBy(modelsTable.modelName);

  res.json(rows.map((r) => ({
    modelId: r.modelId,
    modelName: r.modelName,
    provider: r.provider,
    avgScore: r.avgScore != null ? Number(r.avgScore) : null,
    totalEvaluations: Number(r.totalEvaluations ?? 0),
    totalResponses: Number(r.totalResponses ?? 0),
    avgInferenceMs: r.avgInferenceMs != null ? Number(r.avgInferenceMs) : null,
  })));
});

router.get("/analytics/score-distribution", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      modelId: modelsTable.id,
      modelName: modelsTable.modelName,
      score: judgeEvaluationsTable.score,
      count: count(),
    })
    .from(judgeEvaluationsTable)
    .leftJoin(modelResponsesTable, eq(modelResponsesTable.id, judgeEvaluationsTable.responseId))
    .leftJoin(modelsTable, eq(modelsTable.id, modelResponsesTable.modelId))
    .groupBy(modelsTable.id, modelsTable.modelName, judgeEvaluationsTable.score)
    .orderBy(modelsTable.modelName, judgeEvaluationsTable.score);

  res.json(rows.map((r) => ({
    modelId: r.modelId!,
    modelName: r.modelName!,
    score: r.score,
    count: Number(r.count ?? 0),
  })));
});

router.get("/analytics/results", async (req, res): Promise<void> => {
  const parsed = GetResultsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { datasetId, modelId } = parsed.data;

  const conditions = [];
  if (datasetId != null) conditions.push(eq(questionsTable.datasetId, datasetId));
  if (modelId != null) conditions.push(eq(modelResponsesTable.modelId, modelId));

  // Alias tables for judge model join
  const judgeModels = modelsTable;

  const rows = await db
    .select({
      questionId: questionsTable.id,
      questionText: questionsTable.questionText,
      goldAnswer: questionsTable.goldAnswer,
      questionType: questionsTable.questionType,
      datasetName: datasetsTable.datasetName,
      responseId: modelResponsesTable.id,
      modelName: modelsTable.modelName,
      responseText: modelResponsesTable.responseText,
      inferenceTimeMs: modelResponsesTable.inferenceTimeMs,
      evaluationId: judgeEvaluationsTable.id,
      score: judgeEvaluationsTable.score,
      reasoning: judgeEvaluationsTable.reasoning,
      judgeModelId: judgeEvaluationsTable.judgeModelId,
      evaluatedAt: judgeEvaluationsTable.evaluatedAt,
    })
    .from(questionsTable)
    .leftJoin(datasetsTable, eq(datasetsTable.id, questionsTable.datasetId))
    .leftJoin(modelResponsesTable, eq(modelResponsesTable.questionId, questionsTable.id))
    .leftJoin(modelsTable, eq(modelsTable.id, modelResponsesTable.modelId))
    .leftJoin(judgeEvaluationsTable, eq(judgeEvaluationsTable.responseId, modelResponsesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(questionsTable.id);

  // Fetch judge model names
  const allModels = await db.select().from(judgeModels);
  const modelMap = new Map(allModels.map((m) => [m.id, m.modelName]));

  res.json(rows.map((r) => ({
    questionId: r.questionId,
    questionText: r.questionText,
    goldAnswer: r.goldAnswer,
    questionType: r.questionType,
    datasetName: r.datasetName ?? "",
    responseId: r.responseId ?? 0,
    modelName: r.modelName ?? "",
    responseText: r.responseText ?? "",
    inferenceTimeMs: r.inferenceTimeMs ?? null,
    evaluationId: r.evaluationId ?? null,
    score: r.score ?? null,
    reasoning: r.reasoning ?? null,
    judgeModelName: r.judgeModelId ? (modelMap.get(r.judgeModelId) ?? null) : null,
    evaluatedAt: r.evaluatedAt?.toISOString() ?? null,
  })));
});

router.get("/analytics/spearman", async (_req, res): Promise<void> => {
  // Compute Spearman correlation between judge scores and MCQ accuracy (binary)
  // For MCQ: correctness = 1 if score=5, 0 if score=1
  // We correlate judge scores with this gold-standard signal

  const rows = await db
    .select({
      score: judgeEvaluationsTable.score,
      questionType: questionsTable.questionType,
      goldAnswer: questionsTable.goldAnswer,
      responseText: modelResponsesTable.responseText,
    })
    .from(judgeEvaluationsTable)
    .leftJoin(modelResponsesTable, eq(modelResponsesTable.id, judgeEvaluationsTable.responseId))
    .leftJoin(questionsTable, eq(questionsTable.id, modelResponsesTable.questionId));

  const sampleSize = rows.length;

  if (sampleSize < 2) {
    res.json({
      correlation: null,
      pValue: null,
      sampleSize,
      interpretation: "Not enough data for correlation analysis (need at least 2 evaluations)",
      mcqAccuracy: null,
    });
    return;
  }

  // MCQ accuracy: proportion where score = 5 among MCQ questions
  const mcqRows = rows.filter((r) => r.questionType === "MCQ");
  const mcqAccuracy = mcqRows.length > 0
    ? mcqRows.filter((r) => r.score === 5).length / mcqRows.length
    : null;

  // Compute Spearman rank correlation between scores and binary correctness
  // Binary gold = 1 if (MCQ && score==5) or (OPEN_ENDED && score >= 4), else 0
  const paired: Array<[number, number]> = rows.map((r) => {
    const gold = r.questionType === "MCQ"
      ? (r.score === 5 ? 1 : 0)
      : (r.score != null && r.score >= 4 ? 1 : 0);
    return [r.score ?? 0, gold];
  });

  const rankArray = (arr: number[]): number[] => {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(arr.length);
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j < sorted.length && sorted[j].v === sorted[i].v) j++;
      const avgRank = (i + j - 1) / 2 + 1;
      for (let k = i; k < j; k++) ranks[sorted[k].i] = avgRank;
      i = j;
    }
    return ranks;
  };

  const scores = paired.map((p) => p[0]);
  const golds = paired.map((p) => p[1]);
  const rankScores = rankArray(scores);
  const rankGolds = rankArray(golds);

  const n = paired.length;
  const meanRankS = rankScores.reduce((a, b) => a + b, 0) / n;
  const meanRankG = rankGolds.reduce((a, b) => a + b, 0) / n;

  let num = 0, denS = 0, denG = 0;
  for (let i = 0; i < n; i++) {
    const ds = rankScores[i] - meanRankS;
    const dg = rankGolds[i] - meanRankG;
    num += ds * dg;
    denS += ds * ds;
    denG += dg * dg;
  }

  const denom = Math.sqrt(denS * denG);
  const correlation = denom === 0 ? 0 : num / denom;

  // Approximate p-value using t-distribution
  const t = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
  // Simple approximation using normal distribution
  const pValue = n < 3 ? null : Math.min(1, 2 * Math.exp(-0.717 * Math.abs(t) - 0.416 * t * t));

  const interpretation =
    Math.abs(correlation) >= 0.8 ? "Strong correlation between judge scores and gold answers" :
    Math.abs(correlation) >= 0.5 ? "Moderate correlation between judge scores and gold answers" :
    Math.abs(correlation) >= 0.3 ? "Weak correlation between judge scores and gold answers" :
    "Very weak or no correlation between judge scores and gold answers";

  res.json({
    correlation: Number(correlation.toFixed(4)),
    pValue: pValue != null ? Number(pValue.toFixed(4)) : null,
    sampleSize,
    interpretation,
    mcqAccuracy: mcqAccuracy != null ? Number(mcqAccuracy.toFixed(4)) : null,
  });
});

export default router;
