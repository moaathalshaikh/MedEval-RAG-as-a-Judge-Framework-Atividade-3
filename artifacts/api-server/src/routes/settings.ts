import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable, modelsTable } from "@workspace/db";
import { SaveApiKeysBody } from "@workspace/api-zod";

const router: IRouter = Router();

const KEY_NAMES = {
  openai: "openai_api_key",
  deepseek: "deepseek_api_key",
  claude: "claude_api_key",
} as const;

router.get("/settings/api-keys", async (_req, res): Promise<void> => {
  const [openai] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY_NAMES.openai));
  const [deepseek] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY_NAMES.deepseek));
  const [claude] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY_NAMES.claude));

  res.json({
    openai: !!(openai?.value),
    deepseek: !!(deepseek?.value),
    claude: !!(claude?.value),
  });
});

router.post("/settings/api-keys", async (req, res): Promise<void> => {
  const parsed = SaveApiKeysBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { openaiKey, deepseekKey, claudeKey } = parsed.data;

  const upsertKey = async (key: string, value: string | null | undefined) => {
    if (value == null) return;
    const [existing] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    if (existing) {
      await db.update(settingsTable).set({ value }).where(eq(settingsTable.key, key));
    } else {
      await db.insert(settingsTable).values({ key, value });
    }
  };

  await upsertKey(KEY_NAMES.openai, openaiKey);
  await upsertKey(KEY_NAMES.deepseek, deepseekKey);
  await upsertKey(KEY_NAMES.claude, claudeKey);

  const [openai] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY_NAMES.openai));
  const [deepseek] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY_NAMES.deepseek));
  const [claude] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY_NAMES.claude));

  res.json({
    openai: !!(openai?.value),
    deepseek: !!(deepseek?.value),
    claude: !!(claude?.value),
  });
});

const JUDGE_MODEL_KEY = "judge_model_id";

router.get("/settings/judge-model", async (_req, res): Promise<void> => {
  const [setting] = await db.select().from(settingsTable).where(eq(settingsTable.key, JUDGE_MODEL_KEY));
  if (!setting?.value) {
    res.json({ modelId: null, modelName: null, provider: null, version: null });
    return;
  }
  const modelId = parseInt(setting.value);
  const [model] = await db.select().from(modelsTable).where(eq(modelsTable.id, modelId));
  res.json({
    modelId: model ? model.id : null,
    modelName: model ? model.modelName : null,
    provider: model ? model.provider : null,
    version: model ? model.version : null,
  });
});

router.post("/settings/judge-model", async (req, res): Promise<void> => {
  const { modelId } = req.body;
  if (!modelId || typeof modelId !== "number") {
    res.status(400).json({ error: "modelId (number) is required" });
    return;
  }
  const [model] = await db.select().from(modelsTable).where(eq(modelsTable.id, modelId));
  if (!model) {
    res.status(404).json({ error: "Model not found" });
    return;
  }
  const [existing] = await db.select().from(settingsTable).where(eq(settingsTable.key, JUDGE_MODEL_KEY));
  if (existing) {
    await db.update(settingsTable).set({ value: String(modelId) }).where(eq(settingsTable.key, JUDGE_MODEL_KEY));
  } else {
    await db.insert(settingsTable).values({ key: JUDGE_MODEL_KEY, value: String(modelId) });
  }
  res.json({
    modelId: model.id,
    modelName: model.modelName,
    provider: model.provider,
    version: model.version,
  });
});

export default router;
