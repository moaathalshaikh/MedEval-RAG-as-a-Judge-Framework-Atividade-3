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

// ─── Proper CSV parser (handles quoted fields with commas) ──────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function extractCorrectLetter(val: string): string | null {
  const m = val.trim().match(/\(?([A-Fa-f])\)?/);
  return m ? m[1].toUpperCase() : null;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

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
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [dataset] = await db.insert(datasetsTable).values({
    datasetName: parsed.data.datasetName,
    domain: parsed.data.domain,
  }).returning();
  res.status(201).json({ id: dataset.id, datasetName: dataset.datasetName, domain: dataset.domain, questionCount: 0, createdAt: dataset.createdAt.toISOString() });
});

router.get("/datasets/:id", async (req, res): Promise<void> => {
  const params = GetDatasetParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db
    .select({ id: datasetsTable.id, datasetName: datasetsTable.datasetName, domain: datasetsTable.domain, createdAt: datasetsTable.createdAt, questionCount: sql<number>`cast(count(${questionsTable.id}) as integer)` })
    .from(datasetsTable)
    .leftJoin(questionsTable, eq(questionsTable.datasetId, datasetsTable.id))
    .where(eq(datasetsTable.id, params.data.id))
    .groupBy(datasetsTable.id);
  if (!row) { res.status(404).json({ error: "Dataset not found" }); return; }
  res.json({ id: row.id, datasetName: row.datasetName, domain: row.domain, questionCount: row.questionCount ?? 0, createdAt: row.createdAt.toISOString() });
});

router.delete("/datasets/:id", async (req, res): Promise<void> => {
  const params = DeleteDatasetParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [ds] = await db.delete(datasetsTable).where(eq(datasetsTable.id, params.data.id)).returning();
  if (!ds) { res.status(404).json({ error: "Dataset not found" }); return; }
  res.sendStatus(204);
});

// ─── Upload endpoint ────────────────────────────────────────────────────────
router.post("/datasets/upload", async (req, res): Promise<void> => {
  const parsed = UploadDatasetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { datasetId, content, format } = parsed.data;

  const [dataset] = await db.select().from(datasetsTable).where(eq(datasetsTable.id, datasetId));
  if (!dataset) { res.status(404).json({ error: "Dataset not found" }); return; }

  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  const errors: string[] = [];

  // Fetch existing question texts for this dataset (for duplicate detection)
  const existingRows = await db
    .select({ questionText: questionsTable.questionText })
    .from(questionsTable)
    .where(eq(questionsTable.datasetId, datasetId));
  const existingTexts = new Set(existingRows.map(r => r.questionText.trim().toLowerCase()));

  try {
    if (format === "jsonl") {
      // ── JSONL ────────────────────────────────────────────────────────────
      const lines = content.split("\n").filter((l) => l.trim());
      for (let i = 0; i < lines.length; i++) {
        try {
          const obj = JSON.parse(lines[i]);

          // Support multiple field name conventions:
          // • Standard: questionText / goldAnswer
          // • MedQA open-ended: Question / Free_form_answer
          const questionText =
            obj.questionText ?? obj.question_text ??
            obj.Question ?? obj.question ?? "";

          const goldAnswer =
            obj.goldAnswer ?? obj.gold_answer ??
            obj.Free_form_answer ?? obj.free_form_answer ??
            obj.answer ?? "";

          const questionType =
            (obj.questionType ?? obj.question_type ?? "OPEN_ENDED").toUpperCase() === "MCQ"
              ? "MCQ" : "OPEN_ENDED";

          if (!questionText || !goldAnswer) {
            skipped++;
            errors.push(`Line ${i + 1}: missing question or answer`);
            continue;
          }

          if (existingTexts.has(questionText.trim().toLowerCase())) {
            duplicates++;
            continue;
          }

          const metadata: Record<string, unknown> = obj.metadata ?? {};
          if (obj.Must_have ?? obj.must_have) metadata.must_have = obj.Must_have ?? obj.must_have;
          if (obj.Nice_to_have ?? obj.nice_to_have) metadata.nice_to_have = obj.Nice_to_have ?? obj.nice_to_have;
          if (obj.choices) metadata.choices = obj.choices;

          await db.insert(questionsTable).values({ datasetId, questionText, goldAnswer, questionType, metadata });
          existingTexts.add(questionText.trim().toLowerCase());
          imported++;
        } catch (e) {
          skipped++;
          errors.push(`Line ${i + 1}: ${String(e)}`);
        }
      }
    } else {
      // ── CSV ──────────────────────────────────────────────────────────────
      const lines = content.split("\n").filter((l) => l.trim());
      if (lines.length < 2) { res.json({ imported: 0, skipped: 0, errors: ["CSV has no data rows"] }); return; }

      const headers = parseCSVLine(lines[0]);

      // Detect MCQ format by presence of 'Question_text' and answer option columns
      const isMCQFormat =
        headers.some((h) => h === "Question_text") &&
        headers.some((h) => /^\([A-Fa-f]\)$/.test(h));

      // Detect if it has answers
      const hasAnswerCol = headers.includes("Correct_answer");

      for (let i = 1; i < lines.length; i++) {
        try {
          const cols = parseCSVLine(lines[i]);
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => { row[h] = cols[idx] ?? ""; });

          let questionText = "";
          let goldAnswer = "";
          let questionType = "OPEN_ENDED";
          const metadata: Record<string, unknown> = {};

          if (isMCQFormat) {
            // ── MCQ CSV format (Moaath style) ───────────────────────────
            questionType = "MCQ";
            questionText = row["Question_text"] ?? "";

            // Collect choices (A)-(F), skip empty ones
            const choiceLetters = ["A", "B", "C", "D", "E", "F"];
            const choices: Record<string, string> = {};
            for (const letter of choiceLetters) {
              const val = row[`(${letter})`] ?? "";
              if (val) choices[letter] = val;
            }
            metadata.choices = choices;
            if (row["Question_name"]) metadata.question_name = row["Question_name"];
            if (row["ID"]) metadata.external_id = row["ID"];

            if (hasAnswerCol && row["Correct_answer"]) {
              const letter = extractCorrectLetter(row["Correct_answer"]);
              if (letter && choices[letter]) {
                goldAnswer = `(${letter}) ${choices[letter]}`;
              } else if (row["Correct_answer"].trim()) {
                goldAnswer = row["Correct_answer"].trim();
              }
            }
          } else {
            // ── Standard CSV format ─────────────────────────────────────
            questionText = row["questionText"] ?? row["question_text"] ?? row["question"] ?? "";
            goldAnswer = row["goldAnswer"] ?? row["gold_answer"] ?? row["answer"] ?? "";
            questionType = (row["questionType"] ?? row["question_type"] ?? "OPEN_ENDED").toUpperCase() === "MCQ"
              ? "MCQ" : "OPEN_ENDED";
            if (row["choices"]) metadata.choices = row["choices"];
          }

          if (!questionText) {
            skipped++;
            errors.push(`Row ${i + 1}: missing question text`);
            continue;
          }

          if (existingTexts.has(questionText.trim().toLowerCase())) {
            duplicates++;
            continue;
          }

          // For MCQ without answer, goldAnswer can be empty (set placeholder)
          if (!goldAnswer) {
            goldAnswer = "(no answer provided)";
          }

          await db.insert(questionsTable).values({ datasetId, questionText, goldAnswer, questionType, metadata });
          existingTexts.add(questionText.trim().toLowerCase());
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

  res.json({ imported, skipped, duplicates, errors });
});

export default router;
