import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db, datasetsTable, questionsTable } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { logActivity } from "../lib/activity";
import {
  CreateDatasetBody,
  GetDatasetParams,
  DeleteDatasetParams,
  UploadDatasetBody,
  RenameDatasetParams,
  RenameDatasetBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): req is Request & { user: NonNullable<typeof req.user> } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

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

function displayName(u: { email: string | null; firstName: string | null; lastName: string | null } | null): string | null {
  if (!u) return null;
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.email || null;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

router.get("/datasets", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: datasetsTable.id,
      datasetName: datasetsTable.datasetName,
      domain: datasetsTable.domain,
      datasetType: datasetsTable.datasetType,
      createdBy: datasetsTable.createdBy,
      createdAt: datasetsTable.createdAt,
      questionCount: sql<number>`cast(count(${questionsTable.id}) as integer)`,
      creatorEmail: usersTable.email,
      creatorFirstName: usersTable.firstName,
      creatorLastName: usersTable.lastName,
    })
    .from(datasetsTable)
    .leftJoin(questionsTable, eq(questionsTable.datasetId, datasetsTable.id))
    .leftJoin(usersTable, eq(usersTable.id, datasetsTable.createdBy))
    .groupBy(datasetsTable.id, usersTable.email, usersTable.firstName, usersTable.lastName)
    .orderBy(datasetsTable.createdAt);

  res.json(rows.map((r) => ({
    id: r.id,
    datasetName: r.datasetName,
    domain: r.domain,
    datasetType: r.datasetType,
    questionCount: r.questionCount ?? 0,
    createdAt: r.createdAt.toISOString(),
    createdById: r.createdBy ?? null,
    createdByName: displayName({ email: r.creatorEmail ?? null, firstName: r.creatorFirstName ?? null, lastName: r.creatorLastName ?? null }),
  })));
});

router.post("/datasets", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const parsed = CreateDatasetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [dataset] = await db.insert(datasetsTable).values({
    datasetName: parsed.data.datasetName,
    domain: parsed.data.domain,
    datasetType: parsed.data.datasetType,
    createdBy: uid,
  }).returning();

  const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  await logActivity(req, { action: "ADD_DATASET", entityType: "dataset", entityName: dataset.datasetName, details: `Created ${dataset.datasetType} dataset "${dataset.datasetName}"` });
  res.status(201).json({
    id: dataset.id,
    datasetName: dataset.datasetName,
    domain: dataset.domain,
    datasetType: dataset.datasetType,
    questionCount: 0,
    createdAt: dataset.createdAt.toISOString(),
    createdById: uid,
    createdByName: displayName(creator ?? null),
  });
});

router.get("/datasets/:id", async (req, res): Promise<void> => {
  const params = GetDatasetParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db
    .select({
      id: datasetsTable.id,
      datasetName: datasetsTable.datasetName,
      domain: datasetsTable.domain,
      datasetType: datasetsTable.datasetType,
      createdAt: datasetsTable.createdAt,
      createdBy: datasetsTable.createdBy,
      questionCount: sql<number>`cast(count(${questionsTable.id}) as integer)`,
      creatorEmail: usersTable.email,
      creatorFirstName: usersTable.firstName,
      creatorLastName: usersTable.lastName,
    })
    .from(datasetsTable)
    .leftJoin(questionsTable, eq(questionsTable.datasetId, datasetsTable.id))
    .leftJoin(usersTable, eq(usersTable.id, datasetsTable.createdBy))
    .where(eq(datasetsTable.id, params.data.id))
    .groupBy(datasetsTable.id, usersTable.email, usersTable.firstName, usersTable.lastName);
  if (!row) { res.status(404).json({ error: "Dataset not found" }); return; }
  res.json({
    id: row.id,
    datasetName: row.datasetName,
    domain: row.domain,
    datasetType: row.datasetType,
    questionCount: row.questionCount ?? 0,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdBy ?? null,
    createdByName: displayName({ email: row.creatorEmail ?? null, firstName: row.creatorFirstName ?? null, lastName: row.creatorLastName ?? null }),
  });
});

router.patch("/datasets/:id/rename", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const params = RenameDatasetParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = RenameDatasetBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [existing] = await db.select().from(datasetsTable).where(eq(datasetsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Dataset not found" }); return; }
  if (existing.createdBy && existing.createdBy !== uid) {
    res.status(403).json({ error: "You can only rename your own datasets" });
    return;
  }

  const [updated] = await db
    .update(datasetsTable)
    .set({ datasetName: body.data.datasetName.trim() })
    .where(eq(datasetsTable.id, params.data.id))
    .returning();

  await logActivity(req, { action: "RENAME_DATASET", entityType: "dataset", entityName: updated.datasetName, details: `Renamed dataset from "${existing.datasetName}" to "${updated.datasetName}"` });
  res.json({ id: updated.id, datasetName: updated.datasetName });
});

router.delete("/datasets/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;
  const params = DeleteDatasetParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(datasetsTable).where(eq(datasetsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Dataset not found" }); return; }
  if (existing.createdBy && existing.createdBy !== uid) {
    res.status(403).json({ error: "You can only delete your own datasets" });
    return;
  }

  await logActivity(req, { action: "DELETE_DATASET", entityType: "dataset", entityName: existing.datasetName, details: `Deleted dataset "${existing.datasetName}" (${existing.datasetType})` });
  await db.delete(datasetsTable).where(eq(datasetsTable.id, params.data.id));
  res.sendStatus(204);
});

// ─── Upload endpoint ────────────────────────────────────────────────────────
router.post("/datasets/upload", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const parsed = UploadDatasetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { datasetId, content, format } = parsed.data;

  const [dataset] = await db.select().from(datasetsTable).where(eq(datasetsTable.id, datasetId));
  if (!dataset) { res.status(404).json({ error: "Dataset not found" }); return; }

  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  const errors: string[] = [];

  const existingRows = await db
    .select({ questionText: questionsTable.questionText })
    .from(questionsTable)
    .where(eq(questionsTable.datasetId, datasetId));
  const existingTexts = new Set(existingRows.map(r => r.questionText.trim().toLowerCase()));

  try {
    if (format === "jsonl") {
      const lines = content.split("\n").filter((l) => l.trim());
      for (let i = 0; i < lines.length; i++) {
        try {
          const obj = JSON.parse(lines[i]);

          const questionText =
            obj.questionText ?? obj.question_text ??
            obj.Question ?? obj.question ?? "";

          const goldAnswer =
            obj.goldAnswer ?? obj.gold_answer ??
            obj.Free_form_answer ?? obj.free_form_answer ??
            obj.answer ?? "";

          const questionType =
            dataset.datasetType === "MCQ" ? "MCQ" :
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
      const lines = content.split("\n").filter((l) => l.trim());
      if (lines.length < 2) { res.json({ imported: 0, skipped: 0, errors: ["CSV has no data rows"] }); return; }

      const headers = parseCSVLine(lines[0]);

      const isMCQFormat =
        (headers.some((h) => h === "Question_text") &&
         headers.some((h) => /^\([A-Fa-f]\)$/.test(h))) ||
        dataset.datasetType === "MCQ";

      const hasAnswerCol = headers.includes("Correct_answer");

      for (let i = 1; i < lines.length; i++) {
        try {
          const cols = parseCSVLine(lines[i]);
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => { row[h] = cols[idx] ?? ""; });

          let questionText = "";
          let goldAnswer = "";
          let questionType = dataset.datasetType === "MCQ" ? "MCQ" : "OPEN_ENDED";
          const metadata: Record<string, unknown> = {};

          if (isMCQFormat) {
            questionType = "MCQ";
            questionText = row["Question_text"] ?? "";

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

          if (!goldAnswer) goldAnswer = "(no answer provided)";

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

  await logActivity(req, { action: "UPLOAD_QUESTIONS", entityType: "dataset", entityName: dataset.datasetName, details: `Uploaded ${imported} questions to dataset "${dataset.datasetName}" (${skipped} skipped, ${duplicates} duplicates)` });
  res.json({ imported, skipped, duplicates, errors });
});

export default router;
