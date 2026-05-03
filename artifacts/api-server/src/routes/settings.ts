import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, settingsTable, judgeModelsTable } from "@workspace/db";
import { SaveApiKeysBody } from "@workspace/api-zod";
import { callLLM, type LLMProvider } from "../lib/llm";

const router: IRouter = Router();

const KEY_NAMES = {
  openai: "openai_api_key",
  gemini: "gemini_api_key",
  deepseek: "deepseek_api_key",
  claude: "claude_api_key",
} as const;

const JUDGE_MODEL_ID_KEY = "judge_model_id";
const JUDGE_MODEL_VERSION_KEY = "judge_model_version";

function requireAuth(req: Request, res: Response): req is Request & { user: NonNullable<typeof req.user> } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

async function getSetting(userId: string, key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.userId, userId), eq(settingsTable.key, key)));
  return row?.value ?? null;
}

async function upsertSetting(userId: string, key: string, value: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.userId, userId), eq(settingsTable.key, key)));
  if (existing) {
    await db
      .update(settingsTable)
      .set({ value })
      .where(and(eq(settingsTable.userId, userId), eq(settingsTable.key, key)));
  } else {
    await db.insert(settingsTable).values({ userId, key, value });
  }
}

// ── API Keys ────────────────────────────────────────────────────────────────

router.get("/settings/api-keys", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const openai   = await getSetting(uid, KEY_NAMES.openai);
  const gemini   = await getSetting(uid, KEY_NAMES.gemini);
  const deepseek = await getSetting(uid, KEY_NAMES.deepseek);
  const claude   = await getSetting(uid, KEY_NAMES.claude);

  res.json({ openai: !!openai, gemini: !!gemini, deepseek: !!deepseek, claude: !!claude });
});

router.post("/settings/api-keys", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const parsed = SaveApiKeysBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { openaiKey, geminiKey, deepseekKey, claudeKey } = parsed.data;
  if (openaiKey)   await upsertSetting(uid, KEY_NAMES.openai,   openaiKey);
  if (geminiKey)   await upsertSetting(uid, KEY_NAMES.gemini,   geminiKey);
  if (deepseekKey) await upsertSetting(uid, KEY_NAMES.deepseek, deepseekKey);
  if (claudeKey)   await upsertSetting(uid, KEY_NAMES.claude,   claudeKey);

  const openai   = await getSetting(uid, KEY_NAMES.openai);
  const gemini   = await getSetting(uid, KEY_NAMES.gemini);
  const deepseek = await getSetting(uid, KEY_NAMES.deepseek);
  const claude   = await getSetting(uid, KEY_NAMES.claude);

  res.json({ openai: !!openai, gemini: !!gemini, deepseek: !!deepseek, claude: !!claude });
});

// ── Judge Providers list (public — no auth needed) ─────────────────────────

router.get("/settings/judge-models", async (_req: Request, res: Response): Promise<void> => {
  const models = await db.select().from(judgeModelsTable);
  res.json(models);
});

// ── Judge Model (per-user) ──────────────────────────────────────────────────

router.get("/settings/judge-model", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const providerId   = await getSetting(uid, JUDGE_MODEL_ID_KEY);
  const modelVersion = await getSetting(uid, JUDGE_MODEL_VERSION_KEY);

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

router.post("/settings/judge-model", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

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

  await upsertSetting(uid, JUDGE_MODEL_ID_KEY, String(judgeModelId));
  await upsertSetting(uid, JUDGE_MODEL_VERSION_KEY, modelVersion.trim());
  // Also store per-provider version so multiple providers can be configured
  await upsertSetting(uid, `judge_model_version_${judgeModelId}`, modelVersion.trim());

  res.json({
    judgeModelId: model.id,
    provider: model.provider,
    displayName: model.displayName,
    modelVersion: modelVersion.trim(),
  });
});

// ── Active judge models (providers with API keys + saved model versions) ────

router.get("/settings/active-judge-models", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const allProviders = await db.select().from(judgeModelsTable);

  const [openaiKey, geminiKey, deepseekKey, claudeKey] = await Promise.all([
    getSetting(uid, KEY_NAMES.openai),
    getSetting(uid, KEY_NAMES.gemini),
    getSetting(uid, KEY_NAMES.deepseek),
    getSetting(uid, KEY_NAMES.claude),
  ]);

  const keyMap: Record<string, string | null> = {
    OpenAI: openaiKey,
    Gemini: geminiKey,
    DeepSeek: deepseekKey,
    Claude: claudeKey,
  };

  const result = await Promise.all(
    allProviders.map(async (p) => {
      const hasKey = !!keyMap[p.provider];
      const modelVersion = await getSetting(uid, `judge_model_version_${p.id}`);
      return {
        id: p.id,
        provider: p.provider,
        displayName: p.displayName,
        modelVersion: modelVersion ?? null,
        hasKey,
        active: hasKey && !!modelVersion,
      };
    })
  );

  res.json(result.filter((p) => p.active));
});

// ── Delete API Keys (called on logout for security) ─────────────────────────

router.delete("/settings/api-keys", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  for (const key of Object.values(KEY_NAMES)) {
    await db.delete(settingsTable).where(and(eq(settingsTable.userId, uid), eq(settingsTable.key, key)));
  }

  res.json({ cleared: true });
});

// ── Test Connection (real LLM call to verify key + model) ────────────────────

router.post("/settings/test-connection", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const { provider, modelVersion } = req.body as { provider?: string; modelVersion?: string };
  if (!provider || !modelVersion) {
    res.status(400).json({ success: false, error: "provider and modelVersion are required" });
    return;
  }

  const keyMap: Record<string, string> = {
    OpenAI: KEY_NAMES.openai,
    Gemini: KEY_NAMES.gemini,
    Claude: KEY_NAMES.claude,
    DeepSeek: KEY_NAMES.deepseek,
  };

  const apiKey = await getSetting(uid, keyMap[provider] ?? "");
  if (!apiKey) {
    res.status(400).json({ success: false, error: `No API key configured for ${provider}. Please save your key first.` });
    return;
  }

  try {
    const { text, confirmedModel } = await callLLM(
      provider as LLMProvider,
      modelVersion,
      "Reply with the single word: OK",
      apiKey
    );
    res.json({ success: true, confirmedModel, response: text.trim() });
  } catch (e) {
    const msg = String(e);
    // Produce a readable error
    let friendly = msg;
    if (msg.includes("401") || msg.toLowerCase().includes("invalid api key") || msg.toLowerCase().includes("unauthorized")) {
      friendly = "Invalid API key — please check and re-enter your key.";
    } else if (msg.includes("404") || msg.toLowerCase().includes("model not found") || msg.toLowerCase().includes("does not exist")) {
      friendly = `Model "${modelVersion}" not found for ${provider}. Check the model name.`;
    } else if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
      friendly = "Rate limit exceeded — wait a moment and try again.";
    } else if (msg.includes("insufficient") || msg.toLowerCase().includes("quota")) {
      friendly = "Quota or billing issue — check your account credits.";
    }
    res.status(400).json({ success: false, error: friendly, raw: msg });
  }
});

// ── Dynamic Model List (per provider, using user's API key) ─────────────────

router.get("/settings/available-models", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const provider = req.query.provider as string;
  if (!provider) {
    res.status(400).json({ error: "provider query param is required" });
    return;
  }

  try {
    let models: string[] = [];

    if (provider === "OpenAI") {
      const apiKey = await getSetting(uid, KEY_NAMES.openai);
      if (!apiKey) { res.json({ models: [], error: "API key not configured" }); return; }
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { data: Array<{ id: string }> };
      models = data.data
        .map((m) => m.id)
        .filter((id) => id.startsWith("gpt-") || id.startsWith("o1") || id.startsWith("o3") || id.startsWith("o4"))
        .sort();
    }

    else if (provider === "Gemini") {
      const apiKey = await getSetting(uid, KEY_NAMES.gemini);
      if (!apiKey) { res.json({ models: [], error: "API key not configured" }); return; }
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { models: Array<{ name: string; supportedGenerationMethods?: string[] }> };
      models = data.models
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace("models/", ""))
        .filter((name) => name.startsWith("gemini-"))
        .sort();
    }

    else if (provider === "Claude") {
      const apiKey = await getSetting(uid, KEY_NAMES.claude);
      if (!apiKey) { res.json({ models: [], error: "API key not configured" }); return; }
      const r = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { data: Array<{ id: string }> };
      models = data.data.map((m) => m.id).sort();
    }

    else if (provider === "DeepSeek") {
      const apiKey = await getSetting(uid, KEY_NAMES.deepseek);
      if (!apiKey) { res.json({ models: [], error: "API key not configured" }); return; }
      const r = await fetch("https://api.deepseek.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { data: Array<{ id: string }> };
      models = data.data.map((m) => m.id).sort();
    }

    else {
      res.status(400).json({ error: `Unknown provider: ${provider}` });
      return;
    }

    res.json({ models });
  } catch (e) {
    res.status(500).json({ error: String(e), models: [] });
  }
});

// ── Helper for evaluations.ts to read user's judge config ──────────────────
// (reads settings by user_id stored in judge_evaluations context)

export async function getUserJudgeConfig(userId: string) {
  const [judgeModel] = await (async () => {
    const providerId = await getSetting(userId, JUDGE_MODEL_ID_KEY);
    const modelVersion = await getSetting(userId, JUDGE_MODEL_VERSION_KEY);
    if (!providerId || !modelVersion) return [null];
    const [model] = await db.select().from(judgeModelsTable).where(eq(judgeModelsTable.id, parseInt(providerId)));
    if (!model) return [null];
    return [{ ...model, modelVersion }];
  })();
  return judgeModel;
}

export default router;
