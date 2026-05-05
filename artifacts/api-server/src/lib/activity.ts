import { db, activityLogTable } from "@workspace/db";
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
    if (!user) return;

    const userEmail: string =
      user.email ??
      user.claims?.email ??
      user.firebaseEmail ??
      "unknown@unknown";

    const userName: string | null =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      user.displayName ||
      user.claims?.name ||
      null;

    await db.insert(activityLogTable).values({
      action: params.action,
      entityType: params.entityType ?? null,
      entityName: params.entityName ?? null,
      userId: user.id ?? null,
      userEmail,
      userName: userName ?? null,
      details: params.details ?? null,
    });
  } catch (err) {
    // Fire-and-forget: never let logging crash the request
    console.error("[activity-log] failed to log:", err);
  }
}
