import { pgTable, text, serial, timestamp, integer, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { modelResponsesTable } from "./model_responses";
import { usersTable } from "./auth";

export const humanEvaluationsTable = pgTable(
  "human_evaluations",
  {
    id: serial("id").primaryKey(),
    responseId: integer("response_id").notNull().references(() => modelResponsesTable.id, { onDelete: "cascade" }),
    evaluatorUserId: text("evaluator_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    unique("uq_human_eval_response_user").on(t.responseId, t.evaluatorUserId),
    check("chk_human_score_range", sql`${t.score} BETWEEN 1 AND 5`),
  ]
);

export const insertHumanEvaluationSchema = createInsertSchema(humanEvaluationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHumanEvaluation = z.infer<typeof insertHumanEvaluationSchema>;
export type HumanEvaluationRow = typeof humanEvaluationsTable.$inferSelect;
