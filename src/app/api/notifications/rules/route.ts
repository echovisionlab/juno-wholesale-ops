import {
  createNotificationRule,
  deleteNotificationRule,
  listNotificationRules,
  updateNotificationRule,
} from "@/lib/notifications/repository";
import type { NotificationRuleInput, NotificationRulePatch } from "@/lib/notifications/types";
import {
  authorizeNotificationRequest,
  databaseUrlResponse,
  errorMessage,
  parseJson,
  readId,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = await authorizeNotificationRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const database = databaseUrlResponse();

  const rules = await listNotificationRules(database.databaseUrl);
  return Response.json({ rules });
}

export async function POST(request: Request) {
  const unauthorized = await authorizeNotificationRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const database = databaseUrlResponse();

  try {
    const rule = await createNotificationRule(database.databaseUrl, (await parseJson(request)) as NotificationRuleInput);
    return Response.json({ rule }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Invalid notification rule request") }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const unauthorized = await authorizeNotificationRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const database = databaseUrlResponse();

  try {
    const rule = await updateNotificationRule(database.databaseUrl, (await parseJson(request)) as NotificationRulePatch);
    if (!rule) {
      return Response.json({ error: "notification_rule_not_found" }, { status: 404 });
    }
    return Response.json({ rule });
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Invalid notification rule request") }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const unauthorized = await authorizeNotificationRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const database = databaseUrlResponse();

  try {
    const deleted = await deleteNotificationRule(database.databaseUrl, readId(await parseJson(request), "Notification rule"));
    if (!deleted) {
      return Response.json({ error: "notification_rule_not_found" }, { status: 404 });
    }
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Invalid notification rule request") }, { status: 400 });
  }
}
