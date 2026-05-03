import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, questionsTable, datasetsTable } from "@workspace/db";
import {
  CreateQuestionBody,
  GetQuestionParams,
  DeleteQuestionParams,
  ListQuestionsQueryParams,
} from "@workspace/api-zod";

function requireAuth(req: Request, res: Response): req is Request & { user: NonNullable<typeof req.user> } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

const router: IRouter = Router();

router.get("/questions", async (req, res): Promise<void> => {
  const parsed = ListQuestionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [];
  if (parsed.data.datasetId != null) {
    conditions.push(eq(questionsTable.datasetId, parsed.data.datasetId));
  }
  if (parsed.data.questionType != null) {
    conditions.push(eq(questionsTable.questionType, parsed.data.questionType));
  }

  const rows = conditions.length > 0
    ? await db.select().from(questionsTable).where(and(...conditions)).orderBy(questionsTable.createdAt)
    : await db.select().from(questionsTable).orderBy(questionsTable.createdAt);

  res.json(rows.map((q) => ({
    id: q.id,
    datasetId: q.datasetId,
    questionText: q.questionText,
    goldAnswer: q.goldAnswer,
    questionType: q.questionType,
    metadata: q.metadata ?? {},
    createdAt: q.createdAt.toISOString(),
  })));
});

router.post("/questions", async (req, res): Promise<void> => {
  const parsed = CreateQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [q] = await db.insert(questionsTable).values({
    datasetId: parsed.data.datasetId,
    questionText: parsed.data.questionText,
    goldAnswer: parsed.data.goldAnswer,
    questionType: parsed.data.questionType,
    metadata: parsed.data.metadata ?? {},
  }).returning();
  res.status(201).json({
    id: q.id,
    datasetId: q.datasetId,
    questionText: q.questionText,
    goldAnswer: q.goldAnswer,
    questionType: q.questionType,
    metadata: q.metadata ?? {},
    createdAt: q.createdAt.toISOString(),
  });
});

router.get("/questions/:id", async (req, res): Promise<void> => {
  const params = GetQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [q] = await db.select().from(questionsTable).where(eq(questionsTable.id, params.data.id));
  if (!q) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  res.json({
    id: q.id,
    datasetId: q.datasetId,
    questionText: q.questionText,
    goldAnswer: q.goldAnswer,
    questionType: q.questionType,
    metadata: q.metadata ?? {},
    createdAt: q.createdAt.toISOString(),
  });
});

router.delete("/questions/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const uid = req.user!.id;

  const params = DeleteQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [q] = await db.select().from(questionsTable).where(eq(questionsTable.id, params.data.id));
  if (!q) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  const [dataset] = await db.select().from(datasetsTable).where(eq(datasetsTable.id, q.datasetId));
  if (dataset?.createdBy && dataset.createdBy !== uid) {
    res.status(403).json({ error: "You can only delete questions from your own datasets" });
    return;
  }

  await db.delete(questionsTable).where(eq(questionsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
