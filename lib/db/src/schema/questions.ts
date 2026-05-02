import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { datasetsTable } from "./datasets";

export const questionsTable = pgTable("questions", {
  id: serial("id_question").primaryKey(),
  datasetId: integer("id_dataset").notNull().references(() => datasetsTable.id, { onDelete: "cascade" }),
  questionText: text("question_text").notNull(),
  goldAnswer: text("gold_answer").notNull(),
  questionType: text("question_type").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuestionSchema = createInsertSchema(questionsTable).omit({ id: true, createdAt: true });
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type QuestionRow = typeof questionsTable.$inferSelect;
