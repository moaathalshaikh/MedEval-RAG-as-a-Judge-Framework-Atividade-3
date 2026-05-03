import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { questionsTable } from "./questions";
import { judgeModelsTable } from "./judge_models";
import { usersTable } from "./auth";

export const referenceAnswersTable = pgTable("reference_answers", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => questionsTable.id, { onDelete: "cascade" }),
  judgeModelId: integer("judge_model_id").notNull().references(() => judgeModelsTable.id, { onDelete: "cascade" }),
  answerText: text("answer_text").notNull(),
  modelVersion: text("model_version"),
  confirmedModel: text("confirmed_model"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
}, (t) => [unique("uq_ref_answer").on(t.questionId, t.judgeModelId)]);

export type ReferenceAnswerRow = typeof referenceAnswersTable.$inferSelect;
