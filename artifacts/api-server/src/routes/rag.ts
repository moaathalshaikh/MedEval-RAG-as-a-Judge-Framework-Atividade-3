import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  db,
  ragDocumentsTable,
  ragChunksTable,
  modelResponsesTable,
  questionsTable,
  modelsTable,
  settingsTable,
} from "@workspace/db";
import { getEmbedding, chunkText } from "../lib/embedding";
import { callLLM, type LLMProvider } from "../lib/llm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

async function getUserSetting(userId: string, key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(and(eq(settingsTable.userId, userId), eq(settingsTable.key, key)));
  return row?.value ?? null;
}

// ── GET /rag/documents ────────────────────────────────────────────────────────
router.get("/rag/documents", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const docs = await db
    .select()
    .from(ragDocumentsTable)
    .orderBy(ragDocumentsTable.createdAt);
  res.json(docs);
});

// ── POST /rag/documents ───────────────────────────────────────────────────────
router.post("/rag/documents", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;
  const { title, content, domain, sourceYear, sourceRef } = req.body as {
    title?: string;
    content?: string;
    domain?: string;
    sourceYear?: number;
    sourceRef?: string;
  };
  if (!title?.trim() || !content?.trim()) {
    res.status(400).json({ error: "title and content are required" });
    return;
  }
  const [doc] = await db
    .insert(ragDocumentsTable)
    .values({
      title: title.trim(),
      content: content.trim(),
      domain: domain?.trim() ?? null,
      sourceYear: sourceYear ?? null,
      sourceRef: sourceRef?.trim() ?? null,
      createdBy: uid,
    })
    .returning();
  res.status(201).json(doc);
});

// ── DELETE /rag/documents/:id ─────────────────────────────────────────────────
router.delete("/rag/documents/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(ragDocumentsTable).where(eq(ragDocumentsTable.id, id));
  res.json({ deleted: true });
});

// ── POST /rag/documents/:id/embed ─────────────────────────────────────────────
// Chunks the document and generates embeddings via OpenAI
router.post("/rag/documents/:id/embed", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;
  const docId = parseInt(req.params.id, 10);
  if (isNaN(docId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const apiKey = await getUserSetting(uid, "openai_api_key");
  if (!apiKey) {
    res.status(400).json({ error: "OpenAI API key not configured. Set it in Settings → Judge & API Keys." });
    return;
  }

  const [doc] = await db.select().from(ragDocumentsTable).where(eq(ragDocumentsTable.id, docId));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  // Delete existing chunks for this doc (re-embed)
  await db.delete(ragChunksTable).where(eq(ragChunksTable.documentId, docId));

  const chunks = chunkText(doc.content);
  const errors: string[] = [];
  let embedded = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const embedding = await getEmbedding(chunks[i], apiKey);
      await db.execute(
        sql`INSERT INTO rag_chunks (document_id, chunk_text, chunk_index, embedding)
            VALUES (${docId}, ${chunks[i]}, ${i}, ${`[${embedding.join(",")}]`}::vector)`
      );
      embedded++;
    } catch (e) {
      logger.error({ error: String(e), chunkIndex: i }, "Embedding error");
      errors.push(`Chunk ${i}: ${String(e)}`);
    }
  }

  await db
    .update(ragDocumentsTable)
    .set({ chunkCount: embedded, embeddedAt: new Date() })
    .where(eq(ragDocumentsTable.id, docId));

  res.json({ embedded, total: chunks.length, errors });
});

// ── POST /rag/search ──────────────────────────────────────────────────────────
// Returns top-k relevant chunks for a query
router.post("/rag/search", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;
  const { query, documentIds, topK = 3 } = req.body as {
    query?: string;
    documentIds?: number[];
    topK?: number;
  };
  if (!query?.trim()) { res.status(400).json({ error: "query is required" }); return; }

  const apiKey = await getUserSetting(uid, "openai_api_key");
  if (!apiKey) { res.status(400).json({ error: "OpenAI API key not configured" }); return; }

  const queryEmbedding = await getEmbedding(query, apiKey);
  const vecStr = `[${queryEmbedding.join(",")}]`;

  let rows: Array<{ chunk_text: string; similarity: number; document_id: number; doc_title: string }>;

  if (documentIds && documentIds.length > 0) {
    rows = await db.execute(sql`
      SELECT c.chunk_text, c.document_id,
             1 - (c.embedding <=> ${vecStr}::vector) AS similarity,
             d.title AS doc_title
      FROM rag_chunks c
      JOIN rag_documents d ON d.id = c.document_id
      WHERE c.document_id = ANY(${documentIds}::int[])
        AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${vecStr}::vector
      LIMIT ${topK}
    `) as any;
  } else {
    rows = await db.execute(sql`
      SELECT c.chunk_text, c.document_id,
             1 - (c.embedding <=> ${vecStr}::vector) AS similarity,
             d.title AS doc_title
      FROM rag_chunks c
      JOIN rag_documents d ON d.id = c.document_id
      WHERE c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${vecStr}::vector
      LIMIT ${topK}
    `) as any;
  }

  res.json({ chunks: Array.isArray(rows) ? rows : (rows as any).rows ?? [] });
});

// ── POST /rag/re-infer ────────────────────────────────────────────────────────
// Re-runs LLM inference for a dataset+model with RAG context injected
router.post("/rag/re-infer", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const { datasetId, modelId, documentIds, topK = 3 } = req.body as {
    datasetId?: number;
    modelId?: number;
    documentIds?: number[];
    topK?: number;
  };

  if (!datasetId || !modelId) {
    res.status(400).json({ error: "datasetId and modelId are required" });
    return;
  }

  const [model] = await db.select().from(modelsTable).where(eq(modelsTable.id, modelId));
  if (!model) { res.status(404).json({ error: "Model not found" }); return; }

  const keyMap: Record<string, string> = {
    OpenAI: "openai_api_key",
    Gemini: "gemini_api_key",
    Claude: "claude_api_key",
    DeepSeek: "deepseek_api_key",
  };
  const apiKey = await getUserSetting(uid, keyMap[model.modelType] ?? "openai_api_key");
  const openaiKey = await getUserSetting(uid, "openai_api_key");

  if (!apiKey) {
    res.status(400).json({ error: `${model.modelType} API key not configured` });
    return;
  }
  if (!openaiKey) {
    res.status(400).json({ error: "OpenAI API key required for embeddings" });
    return;
  }

  const questions = await db
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.datasetId, datasetId));

  if (questions.length === 0) {
    res.status(400).json({ error: "No questions found for this dataset" });
    return;
  }

  let generated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const q of questions) {
    try {
      // Search relevant chunks for this question
      const queryEmbedding = await getEmbedding(q.questionText, openaiKey);
      const vecStr = `[${queryEmbedding.join(",")}]`;

      let chunkRows: Array<{ chunk_text: string; doc_title: string }>;
      if (documentIds && documentIds.length > 0) {
        chunkRows = await db.execute(sql`
          SELECT c.chunk_text, d.title AS doc_title
          FROM rag_chunks c
          JOIN rag_documents d ON d.id = c.document_id
          WHERE c.document_id = ANY(${documentIds}::int[])
            AND c.embedding IS NOT NULL
          ORDER BY c.embedding <=> ${vecStr}::vector
          LIMIT ${topK}
        `) as any;
        chunkRows = Array.isArray(chunkRows) ? chunkRows : (chunkRows as any).rows ?? [];
      } else {
        chunkRows = await db.execute(sql`
          SELECT c.chunk_text, d.title AS doc_title
          FROM rag_chunks c
          JOIN rag_documents d ON d.id = c.document_id
          WHERE c.embedding IS NOT NULL
          ORDER BY c.embedding <=> ${vecStr}::vector
          LIMIT ${topK}
        `) as any;
        chunkRows = Array.isArray(chunkRows) ? chunkRows : (chunkRows as any).rows ?? [];
      }

      // Build RAG-augmented prompt
      const ragContext = chunkRows
        .map((c, i) => `[Context ${i + 1} — ${c.doc_title}]\n${c.chunk_text}`)
        .join("\n\n---\n\n");

      const augmentedPrompt = ragContext.length > 0
        ? `${q.questionText}\n\n[RELEVANT CLINICAL CONTEXT — Retrieved from current guidelines]\n\n${ragContext}\n\nPlease answer using both your medical knowledge and the above clinical context.`
        : q.questionText;

      const { text, inferenceTimeMs } = await callLLM(
        model.modelType as LLMProvider,
        model.modelSize,
        augmentedPrompt,
        apiKey
      );

      await db
        .insert(modelResponsesTable)
        .values({
          questionId: q.id,
          modelId: model.id,
          responseText: text,
          inferenceTimeMs,
          createdBy: uid,
          ragEnabled: true,
          ragContext: ragContext || null,
        })
        .onConflictDoUpdate({
          target: [
            modelResponsesTable.questionId,
            modelResponsesTable.modelId,
            modelResponsesTable.ragEnabled,
          ],
          set: {
            responseText: text,
            inferenceTimeMs,
            ragContext: ragContext || null,
          },
        });

      generated++;
    } catch (e) {
      logger.error({ error: String(e), questionId: q.id }, "RAG re-inference error");
      skipped++;
      errors.push(`Q${q.id}: ${String(e).slice(0, 120)}`);
    }
  }

  res.json({ generated, skipped, errors });
});

// ── GET /rag/stats ────────────────────────────────────────────────────────────
router.get("/rag/stats", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const docRes      = await db.execute(sql`SELECT COUNT(*)::int AS n FROM rag_documents`);
  const chunkRes    = await db.execute(sql`SELECT COUNT(*)::int AS n FROM rag_chunks WHERE embedding IS NOT NULL`);
  const ragRes      = await db.execute(sql`SELECT COUNT(*)::int AS n FROM model_responses WHERE rag_enabled = true`);
  const row = (r: any) => (Array.isArray(r) ? r[0] : r?.rows?.[0]) ?? {};
  res.json({
    documents:    Number(row(docRes).n   ?? 0),
    chunks:       Number(row(chunkRes).n ?? 0),
    ragResponses: Number(row(ragRes).n   ?? 0),
  });
});

export default router;
