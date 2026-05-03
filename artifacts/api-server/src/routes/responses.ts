import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
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
  const body = req.body as { responses?: unknown; datasetId?: number };
  if (!body || !Array.isArray(body.responses)) {
    res.status(400).json({ error: "Expected { responses: [...], datasetId? }" });
    return;
  }

  type ImportEntry = {
    questionId?: number;
    externalId?: string;
    questionText?: string;
    datasetId?: number;
    modelId: number;
    responseText: string;
    inferenceTimeMs?: number | null;
  };

  const responses = body.responses as ImportEntry[];
  const datasetId = body.datasetId;
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Cache questions for this dataset to avoid repeated DB calls
  let questionCache: typeof questionsTable.$inferSelect[] | null = null;
  async function getQuestionsForDataset(dsId: number) {
    if (!questionCache) {
      questionCache = await db.select().from(questionsTable).where(eq(questionsTable.datasetId, dsId));
    }
    return questionCache;
  }

  for (const r of responses) {
    try {
      const [model] = await db.select().from(modelsTable).where(eq(modelsTable.id, r.modelId));
      if (!model) {
        skipped++;
        errors.push(`Model ${r.modelId} not found`);
        continue;
      }

      let resolvedQuestionId: number | undefined = r.questionId;

      // Resolve by externalId → metadata.external_id (try first, fall through on miss)
      if (!resolvedQuestionId && r.externalId) {
        const dsId = r.datasetId ?? datasetId;
        if (dsId) {
          const [found] = await db.select().from(questionsTable).where(
            and(
              eq(questionsTable.datasetId, dsId),
              sql`${questionsTable.metadata}->>'external_id' = ${r.externalId}`
            )
          );
          resolvedQuestionId = found?.id;
        }
        // If not found by external_id, fall through to questionText matching below
      }

      // Resolve by questionText prefix — works for both MCQ and open-ended fallback
      if (!resolvedQuestionId && r.questionText) {
        const dsId = r.datasetId ?? datasetId;
        if (!dsId) { skipped++; errors.push(`questionText match: datasetId required`); continue; }
        const prefix = r.questionText.trim().slice(0, 120);
        const questions = await getQuestionsForDataset(dsId);
        const found = questions.find(q =>
          q.questionText.trim().startsWith(prefix.slice(0, 80)) ||
          prefix.startsWith(q.questionText.trim().slice(0, 80))
        );
        resolvedQuestionId = found?.id;
        if (!resolvedQuestionId) { skipped++; errors.push(`No match: "${prefix.slice(0, 60)}..."`); continue; }
      }

      if (!resolvedQuestionId) {
        skipped++;
        errors.push(`Entry missing questionId/externalId/questionText`);
        continue;
      }

      const inserted = await db.insert(modelResponsesTable)
        .values({
          questionId: resolvedQuestionId,
          modelId: r.modelId,
          responseText: r.responseText,
          inferenceTimeMs: r.inferenceTimeMs ?? null,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length > 0) {
        imported++;
      } else {
        skipped++;
        errors.push(`Duplicate: response for question ${resolvedQuestionId} / model ${r.modelId} already exists`);
      }
    } catch (e) {
      skipped++;
      errors.push(`Entry error: ${String(e)}`);
    }
  }

  // Smart dataset detection — when ALL entries failed due to "No match",
  // search other datasets to suggest the correct one.
  let suggestedDataset: { id: number; name: string } | null = null;
  const allNoMatch = imported === 0 && errors.length > 0 &&
    errors.every((e) => e.startsWith("No match:"));

  if (allNoMatch) {
    // Collect up to 5 unique questionTexts that failed
    const sampleTexts = responses
      .filter((r) => r.questionText)
      .slice(0, 5)
      .map((r) => r.questionText!.trim().slice(0, 80));

    if (sampleTexts.length > 0) {
      // Load all datasets except the one already tried
      const allDatasets = await db.select().from(datasetsTable);
      const otherDatasets = allDatasets.filter((d) => d.id !== datasetId);

      for (const ds of otherDatasets) {
        const dsQuestions = await db.select().from(questionsTable)
          .where(eq(questionsTable.datasetId, ds.id));

        const matchCount = sampleTexts.filter((sample) =>
          dsQuestions.some((q) =>
            q.questionText.trim().startsWith(sample.slice(0, 60)) ||
            sample.startsWith(q.questionText.trim().slice(0, 60))
          )
        ).length;

        // If majority of samples match this dataset, suggest it
        if (matchCount >= Math.ceil(sampleTexts.length * 0.6)) {
          suggestedDataset = { id: ds.id, name: ds.datasetName };
          break;
        }
      }
    }
  }

  res.json({ imported, skipped, errors, suggestedDataset });
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
