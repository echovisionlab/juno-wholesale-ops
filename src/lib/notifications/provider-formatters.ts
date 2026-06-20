import type { NotificationConfig } from "./types";

export type NotificationWebhookFormat = "generic" | "slack" | "discord" | "telegram";

const notificationWebhookFormats = ["generic", "slack", "discord", "telegram"] as const;

export type NotificationFormatterInput = {
  subject: string;
  body: string;
  payload: NotificationConfig;
  config: NotificationConfig;
};

export function normalizeNotificationWebhookFormat(value: unknown): NotificationWebhookFormat {
  if (typeof value !== "string" || !value.trim()) {
    return "generic";
  }
  if (isNotificationWebhookFormat(value)) {
    return value;
  }
  throw new Error("Notification webhook format is invalid");
}

function isNotificationWebhookFormat(value: string): value is NotificationWebhookFormat {
  return notificationWebhookFormats.includes(value as NotificationWebhookFormat);
}

export function formatNotificationWebhookPayload(format: NotificationWebhookFormat, input: NotificationFormatterInput): NotificationConfig {
  if (format === "slack") {
    return {
      text: input.subject,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${input.subject}*\n${input.body}`,
          },
        },
      ],
      metadata: safePayloadMetadata(input.payload),
    };
  }

  if (format === "discord") {
    return {
      content: input.subject,
      embeds: [
        {
          title: input.subject,
          description: input.body,
          color: 3_172_995,
        },
      ],
      allowed_mentions: {
        parse: [],
      },
      metadata: safePayloadMetadata(input.payload),
    };
  }

  if (format === "telegram") {
    return {
      ...(readString(input.config.chatId) ? { chat_id: readString(input.config.chatId) } : {}),
      text: `${input.subject}\n\n${input.body}`,
      disable_web_page_preview: true,
      metadata: safePayloadMetadata(input.payload),
    };
  }

  return {
    source: "juno-wholesale-ops",
    readOnly: true,
    subject: input.subject,
    body: input.body,
    ...input.payload,
  };
}

export function notificationWebhookFormatLabel(format: NotificationWebhookFormat): string {
  if (format === "slack") {
    return "Slack-style webhook";
  }
  if (format === "discord") {
    return "Discord-style webhook";
  }
  if (format === "telegram") {
    return "Telegram-style webhook";
  }
  return "Generic webhook";
}

function safePayloadMetadata(payload: NotificationConfig): NotificationConfig {
  return {
    source: "juno-wholesale-ops",
    readOnly: true,
    signal: payload.signal,
    digest: payload.digest,
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
