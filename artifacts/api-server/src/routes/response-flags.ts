import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, count, sql } from "drizzle-orm";
import { db, responseFlagsTable, modelResponsesTable } from "@workspace/db";

const router: IRouter = Router();

const VALID_FLAG_TYPES = ["PROMPT_LEAKAGE", "HALLUCINATION", "OVER_VERBOSE", "FACTUAL_ERROR", "PARTIAL_ANSWER", "OFF_TOPIC"] as const;
type FlagType = typeof VALID_FLAG_TYPES[number];

const VALID_SOURCES = ["HUMAN", "AUTO", "JUDGE"] as const;
type FlagSource = typeof VALID_SOURCES[number];

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// GET /response-flags?responseId=X
router.get("/response-flags", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const responseId = req.query.responseId ? parseInt(req.query.responseId as string) : null;
  if (!responseId) { res.status(400).json({ error: "responseId required" }); return; }

  const flags = await db
    .select()
    .from(responseFlagsTable)
    .where(eq(responseFlagsTable.responseId, responseId))
    .orderBy(responseFlagsTable.createdAt);

  res.json(flags);
});

// GET /response-flags/bulk?responseIds=1,2,3
// Efficiently fetch flags for many responses at once
router.get("/response-flags/bulk", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const raw = req.query.responseIds as string | undefined;
  if (!raw) { res.status(400).json({ error: "responseIds required" }); return; }

  const ids = raw.split(",").map(Number).filter((n) => !isNaN(n) && n > 0);
  if (ids.length === 0) { res.json({}); return; }

  const flags = await db
    .select()
    .from(responseFlagsTable)
    .where(sql`${responseFlagsTable.responseId} = ANY(${sql.raw(`ARRAY[${ids.join(",")}]::integer[]`)})`)
    .orderBy(responseFlagsTable.createdAt);

  // Group by responseId
  const grouped: Record<number, typeof flags> = {};
  for (const f of flags) {
    if (!grouped[f.responseId]) grouped[f.responseId] = [];
    grouped[f.responseId].push(f);
  }
  res.json(grouped);
});

// POST /response-flags
router.post("/response-flags", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;
  const { responseId, flagType, confidence, source, notes } = req.body as {
    responseId?: number;
    flagType?: string;
    confidence?: number;
    source?: string;
    notes?: string;
  };

  if (!responseId || !flagType) {
    res.status(400).json({ error: "responseId and flagType are required" });
    return;
  }
  if (!VALID_FLAG_TYPES.includes(flagType as FlagType)) {
    res.status(400).json({ error: `flagType must be one of: ${VALID_FLAG_TYPES.join(", ")}` });
    return;
  }
  const resolvedSource: FlagSource = VALID_SOURCES.includes(source as FlagSource) ? (source as FlagSource) : "HUMAN";

  // Prevent duplicate same flag on same response by same user
  const existing = await db
    .select({ id: responseFlagsTable.id })
    .from(responseFlagsTable)
    .where(and(
      eq(responseFlagsTable.responseId, responseId),
      eq(responseFlagsTable.flagType, flagType as FlagType),
      eq(responseFlagsTable.createdBy, uid),
    ))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "You already added this flag to this response" });
    return;
  }

  const [saved] = await db
    .insert(responseFlagsTable)
    .values({
      responseId,
      flagType: flagType as FlagType,
      confidence: confidence ?? null,
      source: resolvedSource,
      notes: notes ?? null,
      createdBy: uid,
    })
    .returning();

  res.status(201).json(saved);
});

// DELETE /response-flags/:id
router.delete("/response-flags/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;
  const id = parseInt(req.params.id);

  const [row] = await db
    .select()
    .from(responseFlagsTable)
    .where(and(eq(responseFlagsTable.id, id), eq(responseFlagsTable.createdBy, uid)))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Not found or not yours" }); return; }

  await db.delete(responseFlagsTable).where(eq(responseFlagsTable.id, id));
  res.json({ ok: true });
});

// GET /analytics/flag-stats — aggregate counts per flag type
router.get("/analytics/flag-stats", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const rows = await db
    .select({
      flagType: responseFlagsTable.flagType,
      count: count(responseFlagsTable.id),
    })
    .from(responseFlagsTable)
    .groupBy(responseFlagsTable.flagType)
    .orderBy(sql`count(${responseFlagsTable.id}) DESC`);

  const total = rows.reduce((s, r) => s + Number(r.count), 0);

  res.json(
    rows.map((r) => ({
      flagType: r.flagType,
      count: Number(r.count),
      percentage: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
    }))
  );
});

export default router;
