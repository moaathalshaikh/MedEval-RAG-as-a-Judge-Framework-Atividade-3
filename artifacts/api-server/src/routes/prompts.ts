import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, or, isNull } from "drizzle-orm";
import { db, promptsTable, usersTable } from "@workspace/db";
import type { PromptType, MCQRefSections, OpenRefSections, EvalSections } from "@workspace/db";
import { PROMPT_DEFAULTS, JUDGE_RUBRIC } from "../lib/llm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// ── System (built-in) prompts — hardcoded, not stored in DB ──────────────────

export const SYSTEM_PROMPTS = [
  {
    id: "system_mcq_reference",
    name: "System Default",
    type: "MCQ_REFERENCE" as PromptType,
    isSystem: true,
    createdAt: null,
    ownerName: "System",
    sections: {
      persona: PROMPT_DEFAULTS.MCQ_PERSONA,
    } as MCQRefSections,
  },
  {
    id: "system_open_reference",
    name: "System Default",
    type: "OPEN_REFERENCE" as PromptType,
    isSystem: true,
    createdAt: null,
    ownerName: "System",
    sections: {
      persona: PROMPT_DEFAULTS.OPEN_PERSONA,
      guidance: null,
    } as OpenRefSections,
  },
  {
    id: "system_evaluation",
    name: "System Default",
    type: "EVALUATION" as PromptType,
    isSystem: true,
    createdAt: null,
    ownerName: "System",
    sections: {
      persona: PROMPT_DEFAULTS.EVAL_PERSONA,
      rigor: null,
      rubric: null,
      evalSteps: null,
    } as EvalSections,
  },
];

// Helper: resolve sections from a promptId string (system or DB id)
export async function resolvePromptSections(
  promptId: string | null | undefined,
  expectedType: PromptType
): Promise<MCQRefSections | OpenRefSections | EvalSections | null> {
  if (!promptId || promptId.startsWith("system_")) {
    const sys = SYSTEM_PROMPTS.find((p) => p.type === expectedType);
    return sys ? sys.sections : null;
  }
  const numId = parseInt(promptId, 10);
  if (isNaN(numId)) return null;
  const [row] = await db.select().from(promptsTable).where(eq(promptsTable.id, numId));
  if (!row || row.type !== expectedType) return null;
  return row.sections as MCQRefSections | OpenRefSections | EvalSections;
}

// ── GET /prompts?type=MCQ_REFERENCE|OPEN_REFERENCE|EVALUATION ────────────────

router.get("/prompts", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;
  const typeFilter = req.query.type as PromptType | undefined;

  const userRows = await db
    .select({ prompt: promptsTable, ownerName: usersTable.firstName })
    .from(promptsTable)
    .leftJoin(usersTable, eq(usersTable.id, promptsTable.userId))
    .where(eq(promptsTable.userId, uid));

  const allSystem = typeFilter
    ? SYSTEM_PROMPTS.filter((p) => p.type === typeFilter)
    : SYSTEM_PROMPTS;

  const allUser = typeFilter
    ? userRows.filter((r) => r.prompt.type === typeFilter)
    : userRows;

  const userFormatted = allUser.map((r) => ({
    id: String(r.prompt.id),
    name: r.prompt.name,
    type: r.prompt.type,
    isSystem: false,
    createdAt: r.prompt.createdAt.toISOString(),
    ownerName: r.ownerName ?? "Unknown",
    sections: r.prompt.sections,
  }));

  res.json([...allSystem, ...userFormatted]);
});

// ── POST /prompts ─────────────────────────────────────────────────────────────

router.post("/prompts", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const { name, type, sections } = req.body as {
    name?: string;
    type?: string;
    sections?: Record<string, unknown>;
  };

  if (!name || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const validTypes: PromptType[] = ["MCQ_REFERENCE", "OPEN_REFERENCE", "EVALUATION"];
  if (!type || !validTypes.includes(type as PromptType)) {
    res.status(400).json({ error: "type must be MCQ_REFERENCE, OPEN_REFERENCE, or EVALUATION" });
    return;
  }

  if (!sections || typeof sections !== "object") {
    res.status(400).json({ error: "sections object is required" });
    return;
  }

  // Validate required fields per type
  if (!sections.persona || typeof sections.persona !== "string" || !sections.persona.trim()) {
    res.status(400).json({ error: "sections.persona is required" });
    return;
  }

  try {
    const [row] = await db
      .insert(promptsTable)
      .values({
        userId: uid,
        name: name.trim(),
        type: type as PromptType,
        sections,
      })
      .returning();

    res.status(201).json({
      id: String(row.id),
      name: row.name,
      type: row.type,
      isSystem: false,
      createdAt: row.createdAt.toISOString(),
      sections: row.sections,
    });
  } catch (e) {
    logger.error({ error: String(e) }, "Failed to create prompt");
    res.status(500).json({ error: "Failed to create prompt" });
  }
});

// ── DELETE /prompts/:id ───────────────────────────────────────────────────────

router.delete("/prompts/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid prompt id" });
    return;
  }

  const [row] = await db.select().from(promptsTable).where(eq(promptsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Prompt not found" });
    return;
  }
  if (row.userId !== uid) {
    res.status(403).json({ error: "You can only delete your own prompts" });
    return;
  }

  await db.delete(promptsTable).where(eq(promptsTable.id, id));
  res.json({ deleted: true });
});

// ── GET /prompts/defaults — return default section values for UI ──────────────

router.get("/prompts/defaults", (_req: Request, res: Response): void => {
  res.json({ ...PROMPT_DEFAULTS, JUDGE_RUBRIC });
});

export default router;
