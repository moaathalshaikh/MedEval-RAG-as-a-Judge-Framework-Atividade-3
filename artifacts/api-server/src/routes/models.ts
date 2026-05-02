import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, modelsTable } from "@workspace/db";
import {
  CreateModelBody,
  UpdateModelBody,
  GetModelParams,
  UpdateModelParams,
  DeleteModelParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/models", async (_req, res): Promise<void> => {
  const models = await db.select().from(modelsTable).orderBy(modelsTable.createdAt);
  res.json(models.map((m) => ({
    id: m.id,
    modelName: m.modelName,
    provider: m.provider,
    version: m.version,
    precisionParam: m.precisionParam ?? null,
    createdAt: m.createdAt.toISOString(),
  })));
});

router.post("/models", async (req, res): Promise<void> => {
  const parsed = CreateModelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [model] = await db.insert(modelsTable).values({
    modelName: parsed.data.modelName,
    provider: parsed.data.provider,
    version: parsed.data.version,
    precisionParam: parsed.data.precisionParam ?? null,
  }).returning();
  res.status(201).json({
    id: model.id,
    modelName: model.modelName,
    provider: model.provider,
    version: model.version,
    precisionParam: model.precisionParam ?? null,
    createdAt: model.createdAt.toISOString(),
  });
});

router.get("/models/:id", async (req, res): Promise<void> => {
  const params = GetModelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [model] = await db.select().from(modelsTable).where(eq(modelsTable.id, params.data.id));
  if (!model) {
    res.status(404).json({ error: "Model not found" });
    return;
  }
  res.json({
    id: model.id,
    modelName: model.modelName,
    provider: model.provider,
    version: model.version,
    precisionParam: model.precisionParam ?? null,
    createdAt: model.createdAt.toISOString(),
  });
});

router.patch("/models/:id", async (req, res): Promise<void> => {
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
  if (parsed.data.provider != null) updates.provider = parsed.data.provider;
  if (parsed.data.version != null) updates.version = parsed.data.version;
  if ("precisionParam" in parsed.data) updates.precisionParam = parsed.data.precisionParam ?? null;

  const [model] = await db.update(modelsTable).set(updates).where(eq(modelsTable.id, params.data.id)).returning();
  if (!model) {
    res.status(404).json({ error: "Model not found" });
    return;
  }
  res.json({
    id: model.id,
    modelName: model.modelName,
    provider: model.provider,
    version: model.version,
    precisionParam: model.precisionParam ?? null,
    createdAt: model.createdAt.toISOString(),
  });
});

router.delete("/models/:id", async (req, res): Promise<void> => {
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
