import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import {
  db,
  questionsTable,
  datasetsTable,
  modelResponsesTable,
  modelsTable,
  judgeEvaluationsTable,
  judgeModelsTable,
  humanEvaluationsTable,
  responseFlagsTable,
} from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";

const router: IRouter = Router();

const PG_DUMP =
  "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin/pg_dump";

const INCLUDED_TABLES = [
  "datasets",
  "questions",
  "models",
  "model_responses",
  "judge_models",
  "judge_evaluations",
  "human_evaluations",
  "response_flags",
  "prompts",
  "reference_answers",
  "activity_log",
  "settings",
];

const EXCLUDED_TABLES = ["users", "sessions"];

// ── helpers ──────────────────────────────────────────────────────────────────

async function buildManifest() {
  const pgVersionRow = await db
    .execute(sql`SELECT version()`)
    .catch(() => null);
  const pgVersion =
    (pgVersionRow?.rows?.[0] as any)?.version?.split(" ")?.[1] ?? "16";

  const [qCount] = await db.select({ n: count() }).from(questionsTable);
  const [rCount] = await db.select({ n: count() }).from(modelResponsesTable);
  const [eCount] = await db.select({ n: count() }).from(judgeEvaluationsTable);
  const [hCount] = await db.select({ n: count() }).from(humanEvaluationsTable);
  const [fCount] = await db.select({ n: count() }).from(responseFlagsTable);

  return {
    platform: "MedEval Judge",
    platform_version: "1.0.0",
    backup_created_at: new Date().toISOString(),
    postgres_version: pgVersion,
    included_tables: INCLUDED_TABLES,
    excluded_tables: EXCLUDED_TABLES,
    row_counts: {
      questions: Number(qCount?.n ?? 0),
      model_responses: Number(rCount?.n ?? 0),
      judge_evaluations: Number(eCount?.n ?? 0),
      human_evaluations: Number(hCount?.n ?? 0),
      response_flags: Number(fCount?.n ?? 0),
    },
  };
}

function authGuard(req: any, res: any): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// ── GET /admin/db-backup ──────────────────────────────────────────────────────
// Streams a full pg_dump prefixed with a JSON metadata manifest comment.

router.get("/admin/db-backup", async (req, res): Promise<void> => {
  if (!authGuard(req, res)) return;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    res.status(500).json({ error: "DATABASE_URL not configured" });
    return;
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `medeval-backup-${timestamp}.sql`;

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Backup-Timestamp", now.toISOString());

  // Build and prepend manifest as SQL block comment
  try {
    const manifest = await buildManifest();
    const sep = "-- " + "=".repeat(62);
    const lines = [
      sep,
      "-- MedEval Judge — Backup Manifest",
      sep,
      ...JSON.stringify(manifest, null, 2)
        .split("\n")
        .map((l) => `-- ${l}`),
      sep,
      "",
      "",
    ].join("\n");
    res.write(lines);
  } catch (_) {
    // manifest build failure is non-fatal — continue with dump
  }

  const dump = spawn(PG_DUMP, [
    "--no-password",
    "--format=plain",
    "--encoding=UTF8",
    "--no-owner",
    "--no-privileges",
    "--if-exists",
    "--clean",
    dbUrl,
  ]);

  dump.stdout.pipe(res, { end: true });

  let stderr = "";
  dump.stderr.on("data", (d) => {
    stderr += d.toString();
  });

  dump.on("error", (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: `pg_dump failed: ${err.message}` });
    } else {
      res.destroy();
    }
  });

  dump.on("close", (code) => {
    if (code !== 0 && !res.writableEnded) {
      res.destroy();
      console.error("[db-backup] pg_dump exited with code", code, stderr);
    }
  });
});

// ── GET /admin/research-export ────────────────────────────────────────────────
// Exports research-only data (questions, responses, scores, annotations).
// Query param: ?format=csv (default) | jsonl

router.get("/admin/research-export", async (req, res): Promise<void> => {
  if (!authGuard(req, res)) return;

  const format = req.query.format === "jsonl" ? "jsonl" : "csv";
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `medeval-research-${timestamp}.${format}`;

  // Left-join query: questions → responses → judge evals → human evals
  const rows = await db
    .select({
      question_id: questionsTable.id,
      dataset_name: datasetsTable.name,
      question_type: questionsTable.questionType,
      question_text: questionsTable.questionText,
      gold_answer: questionsTable.goldAnswer,
      response_id: modelResponsesTable.id,
      model_name: modelsTable.name,
      response_text: modelResponsesTable.responseText,
      inference_time_ms: modelResponsesTable.inferenceTimeMs,
      judge_score: judgeEvaluationsTable.score,
      judge_reasoning: judgeEvaluationsTable.reasoning,
      judge_model: judgeModelsTable.displayName,
      judge_model_version: judgeEvaluationsTable.judgeModelVersion,
      evaluated_at: judgeEvaluationsTable.evaluatedAt,
      human_score: humanEvaluationsTable.score,
      human_reasoning: humanEvaluationsTable.reasoning,
    })
    .from(questionsTable)
    .innerJoin(datasetsTable, eq(questionsTable.datasetId, datasetsTable.id))
    .innerJoin(modelResponsesTable, eq(modelResponsesTable.questionId, questionsTable.id))
    .innerJoin(modelsTable, eq(modelResponsesTable.modelId, modelsTable.id))
    .leftJoin(judgeEvaluationsTable, eq(judgeEvaluationsTable.responseId, modelResponsesTable.id))
    .leftJoin(judgeModelsTable, eq(judgeEvaluationsTable.judgeModelId, judgeModelsTable.id))
    .leftJoin(humanEvaluationsTable, eq(humanEvaluationsTable.responseId, modelResponsesTable.id));

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  if (format === "jsonl") {
    res.setHeader("Content-Type", "application/x-ndjson");
    const out = rows.map((r) => JSON.stringify(r)).join("\n");
    res.end(out);
    return;
  }

  // CSV
  res.setHeader("Content-Type", "text/csv");
  const COLS = [
    "question_id",
    "dataset_name",
    "question_type",
    "question_text",
    "gold_answer",
    "response_id",
    "model_name",
    "response_text",
    "inference_time_ms",
    "judge_score",
    "judge_reasoning",
    "judge_model",
    "judge_model_version",
    "evaluated_at",
    "human_score",
    "human_reasoning",
  ] as const;

  function csvCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const header = COLS.join(",");
  const body = rows
    .map((r) => COLS.map((c) => csvCell((r as any)[c])).join(","))
    .join("\n");
  res.end(`${header}\n${body}`);
});

export default router;
