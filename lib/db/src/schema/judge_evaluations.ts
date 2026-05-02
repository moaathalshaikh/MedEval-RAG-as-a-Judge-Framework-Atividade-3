import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { modelResponsesTable } from "./model_responses";
import { modelsTable } from "./models";

export const judgeEvaluationsTable = pgTable("judge_evaluations", {
  id: serial("id_evaluation").primaryKey(),
  responseId: integer("id_response").notNull().references(() => modelResponsesTable.id, { onDelete: "cascade" }),
  judgeModelId: integer("judge_model_id").notNull().references(() => modelsTable.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  reasoning: text("reasoning").notNull(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertJudgeEvaluationSchema = createInsertSchema(judgeEvaluationsTable).omit({ id: true, evaluatedAt: true });
export type InsertJudgeEvaluation = z.infer<typeof insertJudgeEvaluationSchema>;
export type JudgeEvaluationRow = typeof judgeEvaluationsTable.$inferSelect;
