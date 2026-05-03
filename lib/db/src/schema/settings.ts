import { pgTable, text, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const settingsTable = pgTable(
  "settings",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("settings_user_key_unique").on(table.userId, table.key)],
);

export const insertSettingSchema = createInsertSchema(settingsTable).omit({ id: true, updatedAt: true });
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type SettingRow = typeof settingsTable.$inferSelect;
