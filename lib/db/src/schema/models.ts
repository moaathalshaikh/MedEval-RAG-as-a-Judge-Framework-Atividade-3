import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const modelsTable = pgTable("models", {
  id: serial("id_model").primaryKey(),
  modelName: text("model_name").notNull(),
  provider: text("provider").notNull(),
  version: text("version").notNull(),
  precisionParam: text("precision_param"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertModelSchema = createInsertSchema(modelsTable).omit({ id: true, createdAt: true });
export type InsertModel = z.infer<typeof insertModelSchema>;
export type ModelRow = typeof modelsTable.$inferSelect;
