import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, datasetsTable, questionsTable } from "@workspace/db";
import {
  CreateDatasetBody,
  GetDatasetParams,
  DeleteDatasetParams,
  UploadDatasetBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/datasets", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: datasetsTable.id,
      datasetName: datasetsTable.datasetName,
      domain: datasetsTable.domain,
      createdAt: datasetsTable.createdAt,
      questionCount: sql<number>`cast(count(${questionsTable.id}) as integer)`,
    })
    .from(datasetsTable)
    .leftJoin(questionsTable, eq(questionsTable.datasetId, datasetsTable.id))
    .groupBy(datasetsTable.id)
    .orderBy(datasetsTable.createdAt);

  res.json(rows.map((r) => ({
    id: r.id,
    datasetName: r.datasetName,
    domain: r.domain,
    questionCount: r.questionCount ?? 0,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/datasets", async (req, res): Promise<void> => {
  const parsed = CreateDatasetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [dataset] = await db.insert(datasetsTable).values({
    datasetName: parsed.data.datasetName,
    domain: parsed.data.domain,
  }).returning();
  res.status(201).json({
    id: dataset.id,
    datasetName: dataset.datasetName,
    domain: dataset.domain,
    questionCount: 0,
    createdAt: dataset.createdAt.toISOString(),
  });
});

router.get("/datasets/:id", async (req, res): Promise<void> => {
  const params = GetDatasetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select({
      id: datasetsTable.id,
      datasetName: datasetsTable.datasetName,
      domain: datasetsTable.domain,
      createdAt: datasetsTable.createdAt,
      questionCount: sql<number>`cast(count(${questionsTable.id}) as integer)`,
    })
    .from(datasetsTable)
    .leftJoin(questionsTable, eq(questionsTable.datasetId, datasetsTable.id))
    .where(eq(datasetsTable.id, params.data.id))
    .groupBy(datasetsTable.id);
  if (!row) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }
  res.json({
    id: row.id,
    datasetName: row.datasetName,
    domain: row.domain,
    questionCount: row.questionCount ?? 0,
    createdAt: row.createdAt.toISOString(),
  });
});

router.delete("/datasets/:id", async (req, res): Promise<void> => {
  const params = DeleteDatasetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [ds] = await db.delete(datasetsTable).where(eq(datasetsTable.id, params.data.id)).returning();
  if (!ds) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }
  res.sendStatus(204);
});

// Upload dataset (CSV or JSONL content as string)
router.post("/datasets/upload", async (req, res): Promise<void> => {
  const parsed = UploadDatasetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { datasetId, content, format } = parsed.data;

  // Verify dataset exists
  const [dataset] = await db.select().from(datasetsTable).where(eq(datasetsTable.id, datasetId));
  if (!dataset) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    if (format === "jsonl") {
      const lines = content.split("\n").filter((l) => l.trim());
      for (let i = 0; i < lines.length; i++) {
        try {
          const obj = JSON.parse(lines[i]);
          const questionText = obj.question_text ?? obj.question ?? obj.questionText;
          const goldAnswer = obj.gold_answer ?? obj.answer ?? obj.goldAnswer;
          const questionType = (obj.question_type ?? obj.questionType ?? "OPEN_ENDED").toUpperCase();
          const metadata = obj.metadata ?? {};

          if (!questionText || !goldAnswer) {
            skipped++;
            errors.push(`Line ${i + 1}: missing question_text or gold_answer`);
            continue;
          }

          // Add MCQ choices to metadata
          if (obj.choices) metadata.choices = obj.choices;
          if (obj.must_have) metadata.must_have = obj.must_have;
          if (obj.nice_to_have) metadata.nice_to_have = obj.nice_to_have;

          await db.insert(questionsTable).values({
            datasetId,
            questionText,
            goldAnswer,
            questionType: questionType === "MCQ" ? "MCQ" : "OPEN_ENDED",
            metadata,
          });
          imported++;
        } catch (e) {
          skipped++;
          errors.push(`Line ${i + 1}: ${String(e)}`);
        }
      }
    } else {
      // CSV: first line = headers
      const lines = content.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        res.json({ imported: 0, skipped: 0, errors: ["CSV has no data rows"] });
        return;
      }
      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      for (let i = 1; i < lines.length; i++) {
        try {
          const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => { row[h] = cols[idx] ?? ""; });

          const questionText = row.question_text ?? row.question ?? row.questionText ?? "";
          const goldAnswer = row.gold_answer ?? row.answer ?? row.goldAnswer ?? "";
          const questionType = (row.question_type ?? row.questionType ?? "OPEN_ENDED").toUpperCase();

          if (!questionText || !goldAnswer) {
            skipped++;
            errors.push(`Row ${i + 1}: missing question_text or gold_answer`);
            continue;
          }

          const metadata: Record<string, unknown> = {};
          if (row.choices) metadata.choices = row.choices;
          if (row.must_have) metadata.must_have = row.must_have;
          if (row.nice_to_have) metadata.nice_to_have = row.nice_to_have;

          await db.insert(questionsTable).values({
            datasetId,
            questionText,
            goldAnswer,
            questionType: questionType === "MCQ" ? "MCQ" : "OPEN_ENDED",
            metadata,
          });
          imported++;
        } catch (e) {
          skipped++;
          errors.push(`Row ${i + 1}: ${String(e)}`);
        }
      }
    }
  } catch (e) {
    res.status(400).json({ error: `Parse error: ${String(e)}` });
    return;
  }

  res.json({ imported, skipped, errors });
});

export default router;
