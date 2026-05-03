import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, modelsTable } from "@workspace/db";
import { usersTable } from "@workspace/db";
import {
  CreateModelBody,
  UpdateModelBody,
  GetModelParams,
  UpdateModelParams,
  DeleteModelParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): req is Request & { user: NonNullable<typeof req.user> } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function displayName(u: { email: string | null; firstName: string | null; lastName: string | null } | null): string | null {
  if (!u) return null;
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.email || null;
}

function formatModel(m: typeof modelsTable.$inferSelect, creatorName: string | null = null) {
  return {
    id: m.id,
    modelName: m.modelName,
    modelSize: m.modelSize,
    notes: m.notes ?? null,
    createdAt: m.createdAt.toISOString(),
    createdByName: creatorName,
  };
}

router.get("/models", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      model: modelsTable,
      creatorEmail: usersTable.email,
      creatorFirstName: usersTable.firstName,
      creatorLastName: usersTable.lastName,
    })
    .from(modelsTable)
    .leftJoin(usersTable, eq(usersTable.id, modelsTable.createdBy))
    .orderBy(modelsTable.createdAt);

  res.json(rows.map((r) => formatModel(r.model, displayName({
    email: r.creatorEmail ?? null,
    firstName: r.creatorFirstName ?? null,
    lastName: r.creatorLastName ?? null,
  }))));
});

router.post("/models", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const parsed = CreateModelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [model] = await db.insert(modelsTable).values({
    modelName: parsed.data.modelName,
    modelSize: parsed.data.modelSize,
    notes: parsed.data.notes ?? null,
    createdBy: uid,
  }).returning();

  const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  res.status(201).json(formatModel(model, displayName(creator ?? null)));
});

router.get("/models/:id", async (req, res): Promise<void> => {
  const params = GetModelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select({
      model: modelsTable,
      creatorEmail: usersTable.email,
      creatorFirstName: usersTable.firstName,
      creatorLastName: usersTable.lastName,
    })
    .from(modelsTable)
    .leftJoin(usersTable, eq(usersTable.id, modelsTable.createdBy))
    .where(eq(modelsTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Model not found" });
    return;
  }
  res.json(formatModel(row.model, displayName({
    email: row.creatorEmail ?? null,
    firstName: row.creatorFirstName ?? null,
    lastName: row.creatorLastName ?? null,
  })));
});

router.patch("/models/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = UpdateModelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateModelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.modelName != null) updates.modelName = parsed.data.modelName;
  if (parsed.data.modelSize != null) updates.modelSize = parsed.data.modelSize;
  if ("notes" in parsed.data) updates.notes = parsed.data.notes ?? null;

  const [model] = await db.update(modelsTable).set(updates).where(eq(modelsTable.id, params.data.id)).returning();
  if (!model) {
    res.status(404).json({ error: "Model not found" });
    return;
  }

  const [row] = await db
    .select({
      model: modelsTable,
      creatorEmail: usersTable.email,
      creatorFirstName: usersTable.firstName,
      creatorLastName: usersTable.lastName,
    })
    .from(modelsTable)
    .leftJoin(usersTable, eq(usersTable.id, modelsTable.createdBy))
    .where(eq(modelsTable.id, model.id));

  res.json(formatModel(row.model, displayName({
    email: row.creatorEmail ?? null,
    firstName: row.creatorFirstName ?? null,
    lastName: row.creatorLastName ?? null,
  })));
});

router.delete("/models/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const params = DeleteModelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [model] = await db.delete(modelsTable).where(eq(modelsTable.id, params.data.id)).returning();
  if (!model) {
    res.status(404).json({ error: "Model not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
