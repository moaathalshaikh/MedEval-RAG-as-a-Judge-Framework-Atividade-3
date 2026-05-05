import { db, activityLogTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request } from "express";

export interface ActivityParams {
  action: string;
  entityType?: string;
  entityName?: string;
  details?: string;
}

export async function logActivity(req: Request, params: ActivityParams): Promise<void> {
  try {
    const user = req.user as any;
    if (!user?.id) return;

    // Always fetch fresh user data from DB to get the real email/name
    const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));

    const userEmail: string =
      dbUser?.email ??
      user.email ??
      null;

    if (!userEmail) return; // no email means we can't log meaningfully

    const fullName =
      [dbUser?.firstName, dbUser?.lastName].filter(Boolean).join(" ").trim() ||
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      null;

    await db.insert(activityLogTable).values({
      action: params.action,
      entityType: params.entityType ?? null,
      entityName: params.entityName ?? null,
      userId: user.id ?? null,
      userEmail,
      userName: fullName ?? null,
      details: params.details ?? null,
    });
  } catch (err) {
    console.error("[activity-log] failed to log:", err);
  }
}
