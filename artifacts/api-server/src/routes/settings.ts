import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable, judgeModelsTable } from "@workspace/db";
import { SaveApiKeysBody } from "@workspace/api-zod";

const router: IRouter = Router();

const KEY_NAMES = {
  openai: "openai_api_key",
  gemini: "gemini_api_key",
  deepseek: "deepseek_api_key",
  claude: "claude_api_key",
} as const;

router.get("/settings/api-keys", async (_req, res): Promise<void> => {
  const [openai] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY_NAMES.openai));
  const [gemini] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY_NAMES.gemini));
  const [deepseek] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY_NAMES.deepseek));
  const [claude] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY_NAMES.claude));

  res.json({
    openai: !!(openai?.value),
    gemini: !!(gemini?.value),
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

  const { openaiKey, geminiKey, deepseekKey, claudeKey } = parsed.data;

  const upsertKey = async (key: string, value: string | null | undefined) => {
    if (value == null || value === "") return;
    const [existing] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    if (existing) {
      await db.update(settingsTable).set({ value }).where(eq(settingsTable.key, key));
    } else {
      await db.insert(settingsTable).values({ key, value });
    }
  };

  await upsertKey(KEY_NAMES.openai, openaiKey);
  await upsertKey(KEY_NAMES.gemini, geminiKey);
  await upsertKey(KEY_NAMES.deepseek, deepseekKey);
  await upsertKey(KEY_NAMES.claude, claudeKey);

  const [openai] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY_NAMES.openai));
  const [gemini] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY_NAMES.gemini));
  const [deepseek] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY_NAMES.deepseek));
  const [claude] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY_NAMES.claude));

  res.json({
    openai: !!(openai?.value),
    gemini: !!(gemini?.value),
    deepseek: !!(deepseek?.value),
    claude: !!(claude?.value),
  });
});

const JUDGE_MODEL_KEY = "judge_model_id";

router.get("/settings/judge-models", async (_req, res): Promise<void> => {
  const models = await db.select().from(judgeModelsTable);
  res.json(models);
});

router.get("/settings/judge-model", async (_req, res): Promise<void> => {
  const [setting] = await db.select().from(settingsTable).where(eq(settingsTable.key, JUDGE_MODEL_KEY));
  if (!setting?.value) {
    res.json({ judgeModelId: null, displayName: null, provider: null, modelVersion: null });
    return;
  }
  const id = parseInt(setting.value);
  const [model] = await db.select().from(judgeModelsTable).where(eq(judgeModelsTable.id, id));
  if (!model) {
    res.json({ judgeModelId: null, displayName: null, provider: null, modelVersion: null });
    return;
  }
  res.json({
    judgeModelId: model.id,
    displayName: model.displayName,
    provider: model.provider,
    modelVersion: model.modelVersion,
  });
});

router.post("/settings/judge-model", async (req, res): Promise<void> => {
  const { judgeModelId } = req.body;
  if (!judgeModelId || typeof judgeModelId !== "number") {
    res.status(400).json({ error: "judgeModelId (number) is required" });
    return;
  }
  const [model] = await db.select().from(judgeModelsTable).where(eq(judgeModelsTable.id, judgeModelId));
  if (!model) {
    res.status(404).json({ error: "Judge model not found" });
    return;
  }
  const [existing] = await db.select().from(settingsTable).where(eq(settingsTable.key, JUDGE_MODEL_KEY));
  if (existing) {
    await db.update(settingsTable).set({ value: String(judgeModelId) }).where(eq(settingsTable.key, JUDGE_MODEL_KEY));
  } else {
    await db.insert(settingsTable).values({ key: JUDGE_MODEL_KEY, value: String(judgeModelId) });
  }
  res.json({
    judgeModelId: model.id,
    displayName: model.displayName,
    provider: model.provider,
    modelVersion: model.modelVersion,
  });
});

export default router;
