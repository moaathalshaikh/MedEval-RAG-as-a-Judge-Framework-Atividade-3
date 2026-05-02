import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, modelResponsesTable, questionsTable, modelsTable, datasetsTable } from "@workspace/db";
import {
  GenerateResponsesBody,
  GetResponseParams,
  ListResponsesQueryParams,
} from "@workspace/api-zod";
import { callLLM, type LLMProvider } from "../lib/llm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function formatResponse(r: typeof modelResponsesTable.$inferSelect, extras?: {
  questionText?: string | null;
  modelName?: string | null;
  goldAnswer?: string | null;
  questionType?: string | null;
}) {
  return {
    id: r.id,
    questionId: r.questionId,
    modelId: r.modelId,
    responseText: r.responseText,
    inferenceTimeMs: r.inferenceTimeMs ?? null,
    createdAt: r.createdAt.toISOString(),
    questionText: extras?.questionText ?? null,
    modelName: extras?.modelName ?? null,
    goldAnswer: extras?.goldAnswer ?? null,
    questionType: extras?.questionType ?? null,
  };
}

router.get("/responses", async (req, res): Promise<void> => {
  const parsed = ListResponsesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [];
  if (parsed.data.questionId != null) conditions.push(eq(modelResponsesTable.questionId, parsed.data.questionId));
  if (parsed.data.modelId != null) conditions.push(eq(modelResponsesTable.modelId, parsed.data.modelId));

  const rows = await db
    .select({
      response: modelResponsesTable,
      questionText: questionsTable.questionText,
      goldAnswer: questionsTable.goldAnswer,
      questionType: questionsTable.questionType,
      modelName: modelsTable.modelName,
    })
    .from(modelResponsesTable)
    .leftJoin(questionsTable, eq(questionsTable.id, modelResponsesTable.questionId))
    .leftJoin(modelsTable, eq(modelsTable.id, modelResponsesTable.modelId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(modelResponsesTable.createdAt);

  res.json(rows.map((row) => formatResponse(row.response, {
    questionText: row.questionText,
    modelName: row.modelName,
    goldAnswer: row.goldAnswer,
    questionType: row.questionType,
  })));
});

router.post("/responses/generate", async (req, res): Promise<void> => {
  const parsed = GenerateResponsesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { modelId, questionIds, datasetId } = parsed.data;

  // Get the model
  const [model] = await db.select().from(modelsTable).where(eq(modelsTable.id, modelId));
  if (!model) {
    res.status(404).json({ error: "Model not found" });
    return;
  }

  // Get questions
  let questions: typeof questionsTable.$inferSelect[] = [];
  if (questionIds && questionIds.length > 0) {
    for (const qid of questionIds) {
      const [q] = await db.select().from(questionsTable).where(eq(questionsTable.id, qid));
      if (q) questions.push(q);
    }
  } else if (datasetId != null) {
    questions = await db.select().from(questionsTable).where(eq(questionsTable.datasetId, datasetId));
  } else {
    questions = await db.select().from(questionsTable);
  }

  let generated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const q of questions) {
    try {
      const { text, inferenceTimeMs } = await callLLM(
        model.provider as LLMProvider,
        model.version,
        q.questionText
      );
      await db.insert(modelResponsesTable).values({
        questionId: q.id,
        modelId: model.id,
        responseText: text,
        inferenceTimeMs,
      });
      generated++;
    } catch (e) {
      logger.error({ error: String(e), questionId: q.id }, "Failed to generate response");
      skipped++;
      errors.push(`Question ${q.id}: ${String(e)}`);
    }
  }

  res.json({ generated, skipped, errors });
});

router.post("/responses/import", async (req, res): Promise<void> => {
  const body = req.body as { responses?: unknown };
  if (!body || !Array.isArray(body.responses)) {
    res.status(400).json({ error: "Expected { responses: [{ questionId, modelId, responseText, inferenceTimeMs? }] }" });
    return;
  }

  const responses = body.responses as Array<{
    questionId: number;
    modelId: number;
    responseText: string;
    inferenceTimeMs?: number | null;
  }>;
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const r of responses) {
    try {
      const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, r.questionId));
      if (!question) {
        skipped++;
        errors.push(`Question ${r.questionId} not found`);
        continue;
      }

      const [model] = await db.select().from(modelsTable).where(eq(modelsTable.id, r.modelId));
      if (!model) {
        skipped++;
        errors.push(`Model ${r.modelId} not found`);
        continue;
      }

      await db.insert(modelResponsesTable).values({
        questionId: r.questionId,
        modelId: r.modelId,
        responseText: r.responseText,
        inferenceTimeMs: r.inferenceTimeMs ?? null,
      });
      imported++;
    } catch (e) {
      skipped++;
      errors.push(`Entry error: ${String(e)}`);
    }
  }

  res.json({ imported, skipped, errors });
});

router.get("/responses/:id", async (req, res): Promise<void> => {
  const params = GetResponseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select({
      response: modelResponsesTable,
      questionText: questionsTable.questionText,
      goldAnswer: questionsTable.goldAnswer,
      questionType: questionsTable.questionType,
      modelName: modelsTable.modelName,
    })
    .from(modelResponsesTable)
    .leftJoin(questionsTable, eq(questionsTable.id, modelResponsesTable.questionId))
    .leftJoin(modelsTable, eq(modelsTable.id, modelResponsesTable.modelId))
    .where(eq(modelResponsesTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Response not found" });
    return;
  }

  res.json(formatResponse(row.response, {
    questionText: row.questionText,
    modelName: row.modelName,
    goldAnswer: row.goldAnswer,
    questionType: row.questionType,
  }));
});

export default router;
