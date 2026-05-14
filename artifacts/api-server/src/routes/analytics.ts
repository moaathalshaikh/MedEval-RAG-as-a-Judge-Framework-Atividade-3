import { Router, type IRouter } from "express";
import { eq, and, avg, count, sql, gte, min, max } from "drizzle-orm";
import {
  db,
  modelsTable,
  datasetsTable,
  questionsTable,
  modelResponsesTable,
  judgeEvaluationsTable,
  referenceAnswersTable,
  judgeModelsTable,
  humanEvaluationsTable,
  responseFlagsTable,
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
      modelSize: modelsTable.modelSize,
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
    provider: r.modelSize ?? "",
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
      responseCreatedBy: modelResponsesTable.createdBy,
      mustHaveScore: modelResponsesTable.mustHaveScore,
      mcqCorrect: modelResponsesTable.mcqCorrect,
      mcqScore: modelResponsesTable.mcqScore,
      evaluationId: judgeEvaluationsTable.id,
      score: judgeEvaluationsTable.score,
      reasoning: judgeEvaluationsTable.reasoning,
      judgeModelId: judgeEvaluationsTable.judgeModelId,
      evaluatedAt: judgeEvaluationsTable.evaluatedAt,
      evaluationCreatedBy: judgeEvaluationsTable.createdBy,
    })
    .from(questionsTable)
    .leftJoin(datasetsTable, eq(datasetsTable.id, questionsTable.datasetId))
    .leftJoin(modelResponsesTable, eq(modelResponsesTable.questionId, questionsTable.id))
    .leftJoin(modelsTable, eq(modelsTable.id, modelResponsesTable.modelId))
    .leftJoin(judgeEvaluationsTable, eq(judgeEvaluationsTable.responseId, modelResponsesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(questionsTable.id);

  // Fetch all judge model display names
  const allJudgeModels = await db.select().from(judgeModelsTable);
  const judgeMap = new Map(allJudgeModels.map((m) => [m.id, m.displayName]));

  // Fetch ALL reference answers per question (one entry per judge model)
  const questionIds = [...new Set(rows.filter((r) => r.questionId).map((r) => r.questionId))];
  type RefEntry = { answerText: string; judgeModelId: number; confirmedModel: string | null };
  const refAllMap = new Map<number, RefEntry[]>();
  if (questionIds.length > 0) {
    const refs = await db
      .select({
        questionId: referenceAnswersTable.questionId,
        judgeModelId: referenceAnswersTable.judgeModelId,
        answerText: referenceAnswersTable.answerText,
        confirmedModel: referenceAnswersTable.confirmedModel,
        generatedAt: referenceAnswersTable.generatedAt,
      })
      .from(referenceAnswersTable)
      .orderBy(referenceAnswersTable.generatedAt);
    for (const ref of refs) {
      const arr = refAllMap.get(ref.questionId) ?? [];
      // One entry per judge model — newer run replaces older
      const idx = arr.findIndex(a => a.judgeModelId === (ref.judgeModelId ?? 0));
      const entry: RefEntry = { answerText: ref.answerText, judgeModelId: ref.judgeModelId ?? 0, confirmedModel: ref.confirmedModel };
      if (idx >= 0) arr[idx] = entry; else arr.push(entry);
      refAllMap.set(ref.questionId, arr);
    }
  }

  // Build a full display name: "DeepSeek · deepseek-v4-flash"
  const buildJudgeName = (e: RefEntry): string => {
    const dn = judgeMap.get(e.judgeModelId) ?? "Unknown";
    return (e.confirmedModel && e.confirmedModel !== dn) ? `${dn} · ${e.confirmedModel}` : dn;
  };

  res.json(rows.map((r) => {
    const refEntries = refAllMap.get(r.questionId) ?? [];
    const first = refEntries[0];
    return {
      questionId: r.questionId,
      questionText: r.questionText,
      goldAnswer: r.goldAnswer,
      questionType: r.questionType,
      datasetName: r.datasetName ?? "",
      responseId: r.responseId ?? 0,
      modelName: r.modelName ?? "",
      responseText: r.responseText ?? "",
      inferenceTimeMs: r.inferenceTimeMs ?? null,
      responseCreatedBy: r.responseCreatedBy ?? null,
      mustHaveScore: r.mustHaveScore ?? null,
      mcqCorrect: r.mcqCorrect ?? null,
      mcqScore: r.mcqScore ?? null,
      evaluationId: r.evaluationId ?? null,
      score: r.score ?? null,
      reasoning: r.reasoning ?? null,
      judgeModelName: r.judgeModelId ? (judgeMap.get(r.judgeModelId) ?? null) : null,
      evaluatedAt: r.evaluatedAt?.toISOString() ?? null,
      evaluationCreatedBy: r.evaluationCreatedBy ?? null,
      referenceAnswer: first?.answerText ?? null,
      referenceAnswerJudgeName: first ? buildJudgeName(first) : null,
      referenceAnswers: refEntries.map(e => ({ answerText: e.answerText, judgeModelName: buildJudgeName(e) })),
    };
  }));
});

// GET /analytics/disagreements?threshold=2&limit=10
router.get("/analytics/disagreements", async (req, res): Promise<void> => {
  const threshold = req.query.threshold ? parseFloat(req.query.threshold as string) : 2;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

  // Aggregate human evals per response
  const humanAgg = db
    .select({
      responseId: humanEvaluationsTable.responseId,
      avgHuman: avg(humanEvaluationsTable.score).as("avg_human"),
      evalCount: count(humanEvaluationsTable.id).as("eval_count"),
      humanReasonings: sql<string>`string_agg(${humanEvaluationsTable.reasoning}, ' || ')`.as("human_reasonings"),
    })
    .from(humanEvaluationsTable)
    .groupBy(humanEvaluationsTable.responseId)
    .as("ha");

  const rows = await db
    .select({
      responseId: modelResponsesTable.id,
      questionText: questionsTable.questionText,
      responseText: modelResponsesTable.responseText,
      modelName: modelsTable.modelName,
      judgeScore: judgeEvaluationsTable.score,
      judgeReasoning: judgeEvaluationsTable.reasoning,
      judgeModelId: judgeEvaluationsTable.judgeModelId,
      humanAvg: humanAgg.avgHuman,
      humanCount: humanAgg.evalCount,
      humanReasonings: humanAgg.humanReasonings,
      delta: sql<number>`ABS(${humanAgg.avgHuman}::numeric - ${judgeEvaluationsTable.score})`,
    })
    .from(judgeEvaluationsTable)
    .innerJoin(humanAgg, eq(humanAgg.responseId, judgeEvaluationsTable.responseId))
    .innerJoin(modelResponsesTable, eq(modelResponsesTable.id, judgeEvaluationsTable.responseId))
    .innerJoin(questionsTable, eq(questionsTable.id, modelResponsesTable.questionId))
    .innerJoin(modelsTable, eq(modelsTable.id, modelResponsesTable.modelId))
    .where(
      sql`ABS(${humanAgg.avgHuman}::numeric - ${judgeEvaluationsTable.score}) >= ${threshold}`
    )
    .orderBy(sql`ABS(${humanAgg.avgHuman}::numeric - ${judgeEvaluationsTable.score}) DESC`)
    .limit(limit);

  const allJudgeModels = await db.select().from(judgeModelsTable);
  const judgeMap = new Map(allJudgeModels.map((m) => [m.id, m.displayName]));

  res.json(
    rows.map((r) => {
      const humanAvg = r.humanAvg != null ? Number(r.humanAvg) : null;
      const judgeScore = r.judgeScore ?? null;
      const delta = humanAvg != null && judgeScore != null
        ? Math.round(Math.abs(humanAvg - judgeScore) * 100) / 100
        : null;
      const bias =
        humanAvg != null && judgeScore != null
          ? judgeScore > humanAvg
            ? "overrating"
            : "underrating"
          : null;

      return {
        responseId: r.responseId,
        questionText: r.questionText,
        responseText: r.responseText,
        modelName: r.modelName,
        judgeScore,
        judgeReasoning: r.judgeReasoning ?? null,
        judgeModelName: r.judgeModelId ? (judgeMap.get(r.judgeModelId) ?? null) : null,
        humanAvgScore: humanAvg != null ? Math.round(humanAvg * 100) / 100 : null,
        humanEvalCount: Number(r.humanCount ?? 0),
        humanReasonings: r.humanReasonings
          ? r.humanReasonings.split(" || ").filter(Boolean)
          : [],
        disagreementDelta: delta,
        bias,
      };
    })
  );
});

router.get("/analytics/spearman", async (_req, res): Promise<void> => {
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

  const mcqRows = rows.filter((r) => r.questionType === "MCQ");
  const mcqAccuracy = mcqRows.length > 0
    ? mcqRows.filter((r) => r.score === 5).length / mcqRows.length
    : null;

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

  const t = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
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

// GET /analytics/research-insights — full research presentation data
router.get("/analytics/research-insights", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  // ── 1. Aggregate human vs judge pairs ──────────────────────────────────────
  const pairsRaw = await db.execute(sql`
    SELECT
      je.id_evaluation,
      je.id_response,
      je.score            AS judge_score,
      je.judge_model_id,
      ha.avg_human,
      ha.eval_count,
      q.question_type,
      mr.id_model,
      ROUND(ABS(ha.avg_human::numeric - je.score), 2) AS delta,
      CASE WHEN je.score > ha.avg_human THEN 'overrating'
           WHEN je.score < ha.avg_human THEN 'underrating'
           ELSE 'agree' END AS bias
    FROM judge_evaluations je
    INNER JOIN (
      SELECT response_id,
             AVG(score)::numeric  AS avg_human,
             COUNT(*)             AS eval_count
      FROM human_evaluations
      GROUP BY response_id
    ) ha ON ha.response_id = je.id_response
    INNER JOIN model_responses mr ON mr.id_response = je.id_response
    INNER JOIN questions q ON q.id_question = mr.id_question
  `);
  const pairs = pairsRaw.rows as {
    id_evaluation: number; id_response: number; judge_score: number;
    judge_model_id: number | null; avg_human: number; eval_count: number;
    question_type: string; id_model: number; delta: number; bias: string;
  }[];

  const totalPairs = pairs.length;

  // ── 2. Key Findings ──────────────────────────────────────────────────────────
  const overratingPairs  = pairs.filter(p => p.bias === "overrating");
  const underratingPairs = pairs.filter(p => p.bias === "underrating");
  const overratingRate   = totalPairs > 0 ? Math.round((overratingPairs.length / totalPairs) * 1000) / 10 : 0;
  const underratingRate  = totalPairs > 0 ? Math.round((underratingPairs.length / totalPairs) * 1000) / 10 : 0;

  const openPairs = pairs.filter(p => p.question_type === "OPEN_ENDED");
  const mcqPairs  = pairs.filter(p => p.question_type === "MCQ");
  const avgDeltaOpen = openPairs.length > 0 ? openPairs.reduce((s, p) => s + Number(p.delta), 0) / openPairs.length : null;
  const avgDeltaMcq  = mcqPairs.length > 0  ? mcqPairs.reduce((s, p) => s + Number(p.delta), 0) / mcqPairs.length   : null;

  // Spearman human vs judge
  let humanJudgeRho: number | null = null;
  if (totalPairs >= 3) {
    const xs = pairs.map(p => Number(p.avg_human));
    const ys = pairs.map(p => Number(p.judge_score));
    humanJudgeRho = Math.round(spearmanCorr(xs, ys) * 1000) / 1000;
  }

  // Flag stats
  const flagStatsRaw = await db
    .select({ flagType: responseFlagsTable.flagType, cnt: count(responseFlagsTable.id) })
    .from(responseFlagsTable)
    .groupBy(responseFlagsTable.flagType)
    .orderBy(sql`count(${responseFlagsTable.id}) DESC`);
  const totalFlags = flagStatsRaw.reduce((s, r) => s + Number(r.cnt), 0);
  const topFlag = flagStatsRaw[0] ?? null;

  // Avg judge score & avg human score
  const [judgeAvgRow] = await db.select({ avg: avg(judgeEvaluationsTable.score) }).from(judgeEvaluationsTable);
  const [humanAvgRow] = await db.select({ avg: avg(humanEvaluationsTable.score) }).from(humanEvaluationsTable);
  const avgJudge = judgeAvgRow?.avg != null ? Math.round(Number(judgeAvgRow.avg) * 100) / 100 : null;
  const avgHuman = humanAvgRow?.avg != null ? Math.round(Number(humanAvgRow.avg) * 100) / 100 : null;
  const scoreBias = avgJudge != null && avgHuman != null ? Math.round((avgJudge - avgHuman) * 100) / 100 : null;

  const keyFindings = [
    {
      id: "human_judge_agreement",
      title: "Human–Judge Spearman ρ",
      value: humanJudgeRho != null ? humanJudgeRho.toFixed(3) : "N/A",
      subtext: totalPairs > 0 ? `${totalPairs} paired evaluations` : "No human evaluations yet",
      trend: humanJudgeRho == null ? "neutral" : humanJudgeRho >= 0.7 ? "up" : humanJudgeRho >= 0.4 ? "neutral" : "down",
      insight: humanJudgeRho == null
        ? "Add human evaluations on the Results page to measure agreement."
        : humanJudgeRho >= 0.7 ? "Strong human–judge alignment. Judge is reliable."
        : humanJudgeRho >= 0.4 ? "Moderate alignment. Some systematic bias detected."
        : "Low alignment. Judge behavior differs significantly from humans.",
    },
    {
      id: "overrating_bias",
      title: "Judge Overrating Rate",
      value: totalPairs > 0 ? `${overratingRate}%` : "N/A",
      subtext: totalPairs > 0 ? `${overratingPairs.length} of ${totalPairs} pairs` : "No paired evaluations",
      trend: overratingRate > 40 ? "down" : overratingRate > 20 ? "neutral" : "up",
      insight: overratingRate > 40
        ? "Judge is strongly biased toward leniency. May reward verbosity or style over substance."
        : overratingRate > 20
        ? "Mild overrating tendency. Monitor for verbose or stylistically polished responses."
        : totalPairs > 0 ? "Overrating is minimal. Judge scoring appears calibrated."
        : "Run human evaluations to measure overrating.",
    },
    {
      id: "score_gap",
      title: "Score Gap (Judge − Human)",
      value: scoreBias != null ? (scoreBias >= 0 ? `+${scoreBias}` : `${scoreBias}`) : "N/A",
      subtext: avgJudge != null ? `Judge avg ${avgJudge} · Human avg ${avgHuman ?? "—"}` : "Insufficient data",
      trend: scoreBias == null ? "neutral" : Math.abs(scoreBias) < 0.3 ? "up" : scoreBias > 0 ? "down" : "neutral",
      insight: scoreBias == null
        ? "No human evaluations to compare against."
        : Math.abs(scoreBias) < 0.3 ? "Judge scores closely match human averages. Well-calibrated."
        : scoreBias > 0 ? `Judge inflates scores by ~${scoreBias} points on average.`
        : `Judge deflates scores by ~${Math.abs(scoreBias)} points on average.`,
    },
    {
      id: "open_vs_mcq",
      title: "Disagreement by Task Type",
      value: avgDeltaOpen != null ? `Δ ${avgDeltaOpen.toFixed(2)} (open)` : "N/A",
      subtext: avgDeltaMcq != null ? `Δ ${avgDeltaMcq.toFixed(2)} for MCQ` : "Open-ended only",
      trend: avgDeltaOpen == null ? "neutral" : avgDeltaOpen > 1.5 ? "down" : avgDeltaOpen > 0.8 ? "neutral" : "up",
      insight: avgDeltaOpen == null
        ? "No open-ended human evaluations yet."
        : avgDeltaOpen > 1.5
        ? "High variance in open-ended tasks. Judge struggles with subjective assessment."
        : avgDeltaOpen > 0.8
        ? "Moderate disagreement on open-ended. Expected with free-form responses."
        : "Low disagreement on open-ended. Judge is well-aligned with humans.",
    },
    {
      id: "common_failure",
      title: "Most Common Failure Mode",
      value: topFlag != null ? topFlag.flagType.replace(/_/g, " ") : "None flagged",
      subtext: topFlag != null ? `${topFlag.cnt} of ${totalFlags} total flags` : "No flags recorded yet",
      trend: "neutral",
      insight: topFlag == null
        ? "No quality flags have been added. Flag responses on the Results page."
        : topFlag.flagType === "PROMPT_LEAKAGE" ? "Prompt leakage detected. Review system prompt visibility."
        : topFlag.flagType === "HALLUCINATION"  ? "Hallucinations are the top failure. Consider retrieval augmentation."
        : topFlag.flagType === "OVER_VERBOSE"   ? "Models tend to over-explain. May inflate judge scores."
        : topFlag.flagType === "FACTUAL_ERROR"  ? "Factual errors are frequent. Review knowledge cutoffs."
        : topFlag.flagType === "PARTIAL_ANSWER" ? "Partial answers common. Models may lack domain depth."
        : "Off-topic responses detected. Review prompt engineering.",
    },
    {
      id: "underrating",
      title: "Judge Underrating Rate",
      value: totalPairs > 0 ? `${underratingRate}%` : "N/A",
      subtext: totalPairs > 0 ? `${underratingPairs.length} of ${totalPairs} pairs` : "No paired evaluations",
      trend: underratingRate > 40 ? "down" : underratingRate > 20 ? "neutral" : "up",
      insight: underratingRate > 40
        ? "Judge is overly strict. May penalise non-canonical wording even when semantically correct."
        : underratingRate > 20
        ? "Some underrating detected. Judge may miss paraphrase equivalences."
        : totalPairs > 0 ? "Underrating is minimal." : "Run human evaluations to measure underrating.",
    },
  ];

  // ── 3. Top Critical Cases ─────────────────────────────────────────────────
  // Biggest disagreement
  const biggestPair = pairs.sort((a, b) => Number(b.delta) - Number(a.delta))[0] ?? null;
  let biggestDisagreement = null;
  if (biggestPair) {
    const [qRow] = await db.execute(sql`
      SELECT q.question_text, mr.response_text, m.model_name
      FROM model_responses mr
      JOIN questions q ON q.id_question = mr.id_question
      JOIN models m ON m.id_model = mr.id_model
      WHERE mr.id_response = ${biggestPair.id_response}
      LIMIT 1
    `);
    if (qRow) biggestDisagreement = {
      responseId: biggestPair.id_response,
      questionText: (qRow as any).question_text,
      modelName: (qRow as any).model_name,
      judgeScore: biggestPair.judge_score,
      humanAvgScore: Math.round(Number(biggestPair.avg_human) * 100) / 100,
      delta: Number(biggestPair.delta),
      bias: biggestPair.bias,
    };
  }

  // Most flagged responses per type
  const flagsByResponseRaw = await db.execute(sql`
    SELECT rf.response_id, rf.flag_type, COUNT(*) AS cnt,
           q.question_text, mr.response_text, m.model_name
    FROM response_flags rf
    JOIN model_responses mr ON mr.id_response = rf.response_id
    JOIN questions q ON q.id_question = mr.id_question
    JOIN models m ON m.id_model = mr.id_model
    GROUP BY rf.response_id, rf.flag_type, q.question_text, mr.response_text, m.model_name
    ORDER BY cnt DESC
  `);
  const flagsByResponse = flagsByResponseRaw.rows as {
    response_id: number; flag_type: string; cnt: number;
    question_text: string; response_text: string; model_name: string;
  }[];

  const findTopFlag = (type: string) => flagsByResponse.find(r => r.flag_type === type) ?? null;
  const topHallucination = findTopFlag("HALLUCINATION");
  const topPromptLeakage = findTopFlag("PROMPT_LEAKAGE");

  // Best judge agreement (smallest delta, min 1 human eval)
  const bestPair = [...pairs].sort((a, b) => Number(a.delta) - Number(b.delta))[0] ?? null;
  let bestAgreement = null;
  if (bestPair) {
    const [qRow] = await db.execute(sql`
      SELECT q.question_text, mr.response_text, m.model_name
      FROM model_responses mr
      JOIN questions q ON q.id_question = mr.id_question
      JOIN models m ON m.id_model = mr.id_model
      WHERE mr.id_response = ${bestPair.id_response}
      LIMIT 1
    `);
    if (qRow) bestAgreement = {
      responseId: bestPair.id_response,
      questionText: (qRow as any).question_text,
      modelName: (qRow as any).model_name,
      judgeScore: bestPair.judge_score,
      humanAvgScore: Math.round(Number(bestPair.avg_human) * 100) / 100,
      delta: Number(bestPair.delta),
    };
  }

  const topCriticalCases = {
    biggestDisagreement,
    mostHallucinated: topHallucination ? {
      responseId: topHallucination.response_id,
      questionText: topHallucination.question_text,
      modelName: topHallucination.model_name,
      flagCount: Number(topHallucination.cnt),
    } : null,
    mostPromptLeakage: topPromptLeakage ? {
      responseId: topPromptLeakage.response_id,
      questionText: topPromptLeakage.question_text,
      modelName: topPromptLeakage.model_name,
      flagCount: Number(topPromptLeakage.cnt),
    } : null,
    bestAgreement,
  };

  // ── 4. Judge Reliability per model ─────────────────────────────────────────
  const allJudgeModels = await db.select().from(judgeModelsTable);
  const judgeModelMap = new Map(allJudgeModels.map(m => [m.id, m.displayName]));

  const judgeGroups = new Map<number, typeof pairs>();
  for (const p of pairs) {
    const jid = p.judge_model_id ?? -1;
    if (!judgeGroups.has(jid)) judgeGroups.set(jid, []);
    judgeGroups.get(jid)!.push(p);
  }

  const judgeReliability = [...judgeGroups.entries()].map(([jid, jPairs]) => {
    const n = jPairs.length;
    const over  = jPairs.filter(p => p.bias === "overrating").length;
    const under = jPairs.filter(p => p.bias === "underrating").length;
    const avgD  = n > 0 ? Math.round(jPairs.reduce((s, p) => s + Number(p.delta), 0) / n * 100) / 100 : 0;
    let rho: number | null = null;
    if (n >= 3) {
      const xs = jPairs.map(p => Number(p.avg_human));
      const ys = jPairs.map(p => Number(p.judge_score));
      rho = Math.round(spearmanCorr(xs, ys) * 1000) / 1000;
    }
    return {
      judgeModelId: jid,
      judgeModelName: judgeModelMap.get(jid) ?? `Judge #${jid}`,
      n,
      spearmanRho: rho,
      overratingCount: over,
      underratingCount: under,
      overratingRate: n > 0 ? Math.round((over / n) * 1000) / 10 : 0,
      underratingRate: n > 0 ? Math.round((under / n) * 1000) / 10 : 0,
      avgDelta: avgD,
    };
  }).sort((a, b) => b.n - a.n);

  // ── 5. Export bundle metadata ──────────────────────────────────────────────
  const [respCount] = await db.select({ c: count() }).from(modelResponsesTable);
  const [evalCount] = await db.select({ c: count() }).from(judgeEvaluationsTable);
  const [humCount]  = await db.select({ c: count() }).from(humanEvaluationsTable);

  res.json({
    generatedAt: new Date().toISOString(),
    summary: {
      totalResponses: Number(respCount?.c ?? 0),
      totalJudgeEvals: Number(evalCount?.c ?? 0),
      totalHumanEvals: Number(humCount?.c ?? 0),
      totalFlags,
      totalPairs,
      humanJudgeRho,
      overratingRate,
      underratingRate,
      avgJudgeScore: avgJudge,
      avgHumanScore: avgHuman,
      scoreBias,
    },
    keyFindings,
    topCriticalCases,
    judgeReliability,
    flagStats: flagStatsRaw.map(r => ({ flagType: r.flagType, count: Number(r.cnt) })),
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function rankArr(arr: number[]): number[] {
  const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(arr.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length - 1 && sorted[j + 1].v === sorted[i].v) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[sorted[k].i] = r;
    i = j + 1;
  }
  return ranks;
}

function spearmanCorr(x: number[], y: number[]): number {
  const n = x.length;
  const rx = rankArr(x), ry = rankArr(y);
  const d2 = rx.reduce((s, r, i) => s + (r - ry[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

export default router;
