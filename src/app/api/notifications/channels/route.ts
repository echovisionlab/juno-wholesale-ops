import {
  createNotificationChannel,
  deleteNotificationChannel,
  listNotificationChannels,
  updateNotificationChannel,
} from "@/lib/notifications/repository";
import type { NotificationChannelInput, NotificationChannelPatch } from "@/lib/notifications/types";
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

  const channels = await listNotificationChannels(database.databaseUrl);
  return Response.json({ channels });
}

export async function POST(request: Request) {
  const unauthorized = await authorizeNotificationRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const database = databaseUrlResponse();

  try {
    const channel = await createNotificationChannel(database.databaseUrl, (await parseJson(request)) as NotificationChannelInput);
    return Response.json({ channel }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Invalid notification channel request") }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const unauthorized = await authorizeNotificationRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const database = databaseUrlResponse();

  try {
    const channel = await updateNotificationChannel(database.databaseUrl, (await parseJson(request)) as NotificationChannelPatch);
    if (!channel) {
      return Response.json({ error: "notification_channel_not_found" }, { status: 404 });
    }
    return Response.json({ channel });
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Invalid notification channel request") }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const unauthorized = await authorizeNotificationRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const database = databaseUrlResponse();

  try {
    const deleted = await deleteNotificationChannel(database.databaseUrl, readId(await parseJson(request), "Notification channel"));
    if (!deleted) {
      return Response.json({ error: "notification_channel_not_found" }, { status: 404 });
    }
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Invalid notification channel request") }, { status: 400 });
  }
}
