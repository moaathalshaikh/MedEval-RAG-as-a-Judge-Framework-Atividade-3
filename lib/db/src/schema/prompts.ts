import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export type MCQRefSections = {
  persona: string;
};

export type OpenRefSections = {
  persona: string;
  guidance: string | null;
};

export type EvalSections = {
  persona: string;
  rigor: string | null;
  rubric: string | null;
  evalSteps: string | null;
};

export type PromptSections = MCQRefSections | OpenRefSections | EvalSections;

export type PromptType = "MCQ_REFERENCE" | "OPEN_REFERENCE" | "EVALUATION";

export const promptsTable = pgTable("prompts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().$type<PromptType>(),
  sections: jsonb("sections").notNull().$type<PromptSections>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PromptRow = typeof promptsTable.$inferSelect;
