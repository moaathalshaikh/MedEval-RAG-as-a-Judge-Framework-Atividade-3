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

const JUDGE_MODEL_ID_KEY = "judge_model_id";
const JUDGE_MODEL_VERSION_KEY = "judge_model_version";

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return row?.value ?? null;
}

async function upsertSetting(key: string, value: string): Promise<void> {
  const [existing] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  if (existing) {
    await db.update(settingsTable).set({ value }).where(eq(settingsTable.key, key));
  } else {
    await db.insert(settingsTable).values({ key, value });
  }
}

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
    await upsertSetting(key, value);
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

// List the 4 provider rows
router.get("/settings/judge-models", async (_req, res): Promise<void> => {
  const models = await db.select().from(judgeModelsTable);
  res.json(models);
});

// Get current judge config: provider row + model version from settings
router.get("/settings/judge-model", async (_req, res): Promise<void> => {
  const providerId = await getSetting(JUDGE_MODEL_ID_KEY);
  const modelVersion = await getSetting(JUDGE_MODEL_VERSION_KEY);

  if (!providerId) {
    res.json({ judgeModelId: null, provider: null, displayName: null, modelVersion: null });
    return;
  }

  const [model] = await db.select().from(judgeModelsTable).where(eq(judgeModelsTable.id, parseInt(providerId)));
  if (!model) {
    res.json({ judgeModelId: null, provider: null, displayName: null, modelVersion: null });
    return;
  }

  res.json({
    judgeModelId: model.id,
    provider: model.provider,
    displayName: model.displayName,
    modelVersion: modelVersion ?? "",
  });
});

// Save judge config: { judgeModelId, modelVersion }
router.post("/settings/judge-model", async (req, res): Promise<void> => {
  const { judgeModelId, modelVersion } = req.body;

  if (!judgeModelId || typeof judgeModelId !== "number") {
    res.status(400).json({ error: "judgeModelId (number) is required" });
    return;
  }
  if (!modelVersion || typeof modelVersion !== "string" || !modelVersion.trim()) {
    res.status(400).json({ error: "modelVersion (string) is required" });
    return;
  }

  const [model] = await db.select().from(judgeModelsTable).where(eq(judgeModelsTable.id, judgeModelId));
  if (!model) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }

  await upsertSetting(JUDGE_MODEL_ID_KEY, String(judgeModelId));
  await upsertSetting(JUDGE_MODEL_VERSION_KEY, modelVersion.trim());

  res.json({
    judgeModelId: model.id,
    provider: model.provider,
    displayName: model.displayName,
    modelVersion: modelVersion.trim(),
  });
});

export default router;
