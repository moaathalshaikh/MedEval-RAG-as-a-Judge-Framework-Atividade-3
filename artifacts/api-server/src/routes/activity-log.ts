import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, activityLogTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/activity-log", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(activityLogTable)
    .orderBy(desc(activityLogTable.createdAt))
    .limit(500);

  res.json(rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType ?? null,
    entityName: r.entityName ?? null,
    userId: r.userId ?? null,
    userEmail: r.userEmail,
    userName: r.userName ?? null,
    details: r.details ?? null,
    createdAt: r.createdAt.toISOString(),
  })));
});

export default router;
