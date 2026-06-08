import { pgTable, text, serial, timestamp, integer, customType } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

// ── pgvector custom type (1536-dim for text-embedding-3-small) ────────────────
export const vectorCol = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  fromDriver(value: string): number[] {
    return (value as string)
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map(Number);
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
});

// ── RAG Documents ─────────────────────────────────────────────────────────────
// targetType: "all" | "mcq" | "open_ended"
// Controls which question types this document is injected into during re-inference.
export const ragDocumentsTable = pgTable("rag_documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  domain: text("domain"),
  sourceYear: integer("source_year"),
  sourceRef: text("source_ref"),
  targetType: text("target_type").notNull().default("all"),
  chunkCount: integer("chunk_count").notNull().default(0),
  embeddedAt: timestamp("embedded_at", { withTimezone: true }),
  createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RagDocumentRow = typeof ragDocumentsTable.$inferSelect;

// ── RAG Chunks (with pgvector embedding) ─────────────────────────────────────
export const ragChunksTable = pgTable("rag_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => ragDocumentsTable.id, { onDelete: "cascade" }),
  chunkText: text("chunk_text").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  embedding: vectorCol("embedding"),
});

export type RagChunkRow = typeof ragChunksTable.$inferSelect;
