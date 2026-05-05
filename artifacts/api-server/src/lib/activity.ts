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

    // Fetch fresh user data from DB to get real email/name
    const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));

    // Build display values — never block logging due to missing email
    const userEmail: string =
      dbUser?.email ??
      user.email ??
      `uid:${user.id}`;

    const fullName: string | null =
      [dbUser?.firstName, dbUser?.lastName].filter(Boolean).join(" ").trim() ||
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      null;

    await db.insert(activityLogTable).values({
      action: params.action,
      entityType: params.entityType ?? null,
      entityName: params.entityName ?? null,
      userId: user.id,
      userEmail,
      userName: fullName,
      details: params.details ?? null,
    });
  } catch (err) {
    console.error("[activity-log] failed to log:", err);
  }
}
