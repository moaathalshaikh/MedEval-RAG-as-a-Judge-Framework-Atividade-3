import { pgTable, text, serial, timestamp, integer, real, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { modelResponsesTable } from "./model_responses";

export const flagTypeEnum = pgEnum("flag_type", [
  "PROMPT_LEAKAGE",
  "HALLUCINATION",
  "OVER_VERBOSE",
  "FACTUAL_ERROR",
  "PARTIAL_ANSWER",
  "OFF_TOPIC",
]);

export const flagSourceEnum = pgEnum("flag_source", ["HUMAN", "AUTO", "JUDGE"]);

export const responseFlagsTable = pgTable("response_flags", {
  id: serial("id").primaryKey(),
  responseId: integer("response_id").notNull().references(() => modelResponsesTable.id, { onDelete: "cascade" }),
  flagType: flagTypeEnum("flag_type").notNull(),
  confidence: real("confidence"),
  source: flagSourceEnum("source").notNull().default("HUMAN"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertResponseFlagSchema = createInsertSchema(responseFlagsTable).omit({ id: true, createdAt: true });
export type InsertResponseFlag = z.infer<typeof insertResponseFlagSchema>;
export type ResponseFlagRow = typeof responseFlagsTable.$inferSelect;
