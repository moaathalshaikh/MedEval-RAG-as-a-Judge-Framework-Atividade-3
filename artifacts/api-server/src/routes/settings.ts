import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
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

export default router;
