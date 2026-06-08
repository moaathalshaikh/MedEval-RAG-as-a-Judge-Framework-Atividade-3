import { pgTable, text, serial, timestamp, integer, unique, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { questionsTable } from "./questions";
import { modelsTable } from "./models";
import { usersTable } from "./auth";

export const modelResponsesTable = pgTable("model_responses", {
  id: serial("id_response").primaryKey(),
  questionId: integer("id_question").notNull().references(() => questionsTable.id, { onDelete: "cascade" }),
  modelId: integer("id_model").notNull().references(() => modelsTable.id, { onDelete: "cascade" }),
  responseText: text("response_text").notNull(),
  inferenceTimeMs: integer("inference_time_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  // Open-ended extra fields
  mustHaveScore: real("must_have_score"),
  // MCQ extra fields
  mcqCorrect: text("mcq_correct"),
  mcqScore: text("mcq_score"),
  // RAG fields (Activity 3)
  ragEnabled: boolean("rag_enabled").notNull().default(false),
  ragContext: text("rag_context"),
}, (t) => [unique("uq_response_question_model_rag").on(t.questionId, t.modelId, t.ragEnabled)]);

export const insertModelResponseSchema = createInsertSchema(modelResponsesTable).omit({ id: true, createdAt: true });
export type InsertModelResponse = z.infer<typeof insertModelResponseSchema>;
export type ModelResponseRow = typeof modelResponsesTable.$inferSelect;
