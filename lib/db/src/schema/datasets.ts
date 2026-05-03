import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const datasetsTable = pgTable("datasets", {
  id: serial("id_dataset").primaryKey(),
  datasetName: text("dataset_name").notNull(),
  domain: text("domain").notNull(),
  datasetType: text("dataset_type").notNull().default("OPEN_ENDED"),
  createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDatasetSchema = createInsertSchema(datasetsTable).omit({ id: true, createdAt: true });
export type InsertDataset = z.infer<typeof insertDatasetSchema>;
export type DatasetRow = typeof datasetsTable.$inferSelect;
