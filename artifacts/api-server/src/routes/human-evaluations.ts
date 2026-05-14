import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, count, sql } from "drizzle-orm";
import { db, humanEvaluationsTable, judgeEvaluationsTable, modelResponsesTable, questionsTable } from "@workspace/db";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// GET /human-evaluations?responseId=X
router.get("/human-evaluations", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;
  const responseId = req.query.responseId ? parseInt(req.query.responseId as string) : null;
  if (!responseId) { res.status(400).json({ error: "responseId required" }); return; }

  const rows = await db
    .select()
    .from(humanEvaluationsTable)
    .where(eq(humanEvaluationsTable.responseId, responseId));

  const myEval = rows.find((r) => r.evaluatorUserId === uid) ?? null;
  const avgScore = rows.length > 0
    ? Math.round((rows.reduce((s, r) => s + r.score, 0) / rows.length) * 100) / 100
    : null;

  res.json({ evaluations: rows, myEval, avgScore, count: rows.length });
});

// POST /human-evaluations — upsert
router.post("/human-evaluations", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;
  const { responseId, score, reasoning } = req.body as {
    responseId?: number;
    score?: number;
    reasoning?: string;
  };

  if (!responseId || score == null) {
    res.status(400).json({ error: "responseId and score are required" });
    return;
  }
  if (score < 1 || score > 5) {
    res.status(400).json({ error: "score must be between 1 and 5" });
    return;
  }

  // Verify response has a judge evaluation
  const [judgeEval] = await db
    .select({ id: judgeEvaluationsTable.id })
    .from(judgeEvaluationsTable)
    .where(eq(judgeEvaluationsTable.responseId, responseId))
    .limit(1);

  if (!judgeEval) {
    res.status(400).json({ error: "This response has no judge evaluation yet. Run evaluation first." });
    return;
  }

  const existing = await db
    .select()
    .from(humanEvaluationsTable)
    .where(and(
      eq(humanEvaluationsTable.responseId, responseId),
      eq(humanEvaluationsTable.evaluatorUserId, uid),
    ))
    .limit(1);

  let saved;
  if (existing.length > 0) {
    [saved] = await db
      .update(humanEvaluationsTable)
      .set({ score, reasoning: reasoning ?? null })
      .where(eq(humanEvaluationsTable.id, existing[0].id))
      .returning();
  } else {
    [saved] = await db
      .insert(humanEvaluationsTable)
      .values({ responseId, evaluatorUserId: uid, score, reasoning: reasoning ?? null })
      .returning();
  }

  res.status(existing.length > 0 ? 200 : 201).json(saved);
});

// DELETE /human-evaluations/:id
router.delete("/human-evaluations/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;
  const id = parseInt(req.params.id);

  const [row] = await db
    .select()
    .from(humanEvaluationsTable)
    .where(and(eq(humanEvaluationsTable.id, id), eq(humanEvaluationsTable.evaluatorUserId, uid)))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Not found or not yours" }); return; }

  await db.delete(humanEvaluationsTable).where(eq(humanEvaluationsTable.id, id));
  res.json({ ok: true });
});

// GET /analytics/spearman?datasetId=X&modelId=Y
router.get("/analytics/spearman", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const datasetId = req.query.datasetId ? parseInt(req.query.datasetId as string) : null;
  const modelId = req.query.modelId ? parseInt(req.query.modelId as string) : null;

  // Get all judge evals with optional dataset/model filter
  const judgeQuery = db
    .select({
      responseId: judgeEvaluationsTable.responseId,
      judgeScore: judgeEvaluationsTable.score,
    })
    .from(judgeEvaluationsTable)
    .leftJoin(modelResponsesTable, eq(modelResponsesTable.id, judgeEvaluationsTable.responseId))
    .leftJoin(questionsTable, eq(questionsTable.id, modelResponsesTable.questionId));

  const conditions = [];
  if (datasetId) conditions.push(eq(questionsTable.datasetId, datasetId));
  if (modelId) conditions.push(eq(modelResponsesTable.modelId, modelId));

  const judgeRows = conditions.length > 0
    ? await judgeQuery.where(and(...conditions))
    : await judgeQuery;

  // Get human eval averages per response
  const humanRows = await db
    .select({
      responseId: humanEvaluationsTable.responseId,
      avgHuman: sql<number>`AVG(${humanEvaluationsTable.score})`,
      evalCount: count(humanEvaluationsTable.id),
    })
    .from(humanEvaluationsTable)
    .groupBy(humanEvaluationsTable.responseId);

  const judgeMap = new Map(judgeRows.map((r) => [r.responseId, r.judgeScore]));
  const humanMap = new Map(humanRows.map((r) => [r.responseId, { avg: Number(r.avgHuman), count: Number(r.evalCount) }]));

  // Intersection: responses that have BOTH judge and human evals
  const commonIds = [...judgeMap.keys()].filter((id) => humanMap.has(id));

  if (commonIds.length < 3) {
    res.json({
      rho: null,
      n: commonIds.length,
      totalHumanEvals: humanRows.reduce((s, r) => s + Number(r.evalCount), 0),
      interpretation: null,
      message: `Not enough paired evaluations (${commonIds.length} found, minimum 3 required).`,
    });
    return;
  }

  const humanScores = commonIds.map((id) => humanMap.get(id)!.avg);
  const judgeScores = commonIds.map((id) => judgeMap.get(id)!);
  const rho = spearmanCorrelation(humanScores, judgeScores);
  const totalHumanEvals = commonIds.reduce((s, id) => s + (humanMap.get(id)?.count ?? 0), 0);

  let interpretation = "";
  if (rho >= 0.9) interpretation = "Very Strong Agreement";
  else if (rho >= 0.7) interpretation = "Strong Agreement";
  else if (rho >= 0.5) interpretation = "Moderate Agreement";
  else if (rho >= 0.3) interpretation = "Weak Agreement";
  else if (rho >= 0) interpretation = "Very Weak Agreement";
  else if (rho >= -0.3) interpretation = "Slight Disagreement";
  else interpretation = "Strong Disagreement";

  res.json({ rho: Math.round(rho * 1000) / 1000, n: commonIds.length, totalHumanEvals, interpretation, message: null });
});

// ── Pure Spearman implementation ──────────────────────────────────────────────

function rankArray(arr: number[]): number[] {
  const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length - 1 && sorted[j + 1].v === sorted[i].v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[sorted[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function spearmanCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  const rx = rankArray(x);
  const ry = rankArray(y);
  const sumD2 = rx.reduce((s, r, i) => s + (r - ry[i]) ** 2, 0);
  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

export default router;
