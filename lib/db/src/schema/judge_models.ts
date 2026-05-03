import { pgTable, text, serial } from "drizzle-orm/pg-core";

export const judgeModelsTable = pgTable("judge_models", {
  id: serial("id_judge_model").primaryKey(),
  provider: text("provider").notNull(),
  displayName: text("display_name").notNull(),
  modelVersion: text("model_version").notNull(),
});

export type JudgeModelRow = typeof judgeModelsTable.$inferSelect;
