import { describe, expect, it } from "vitest";
import {
  formatNotificationWebhookPayload,
  normalizeNotificationWebhookFormat,
  notificationWebhookFormatLabel,
} from "./provider-formatters";

describe("notification provider formatters", () => {
  it("normalizes supported webhook formats and rejects unknown values", () => {
    expect(normalizeNotificationWebhookFormat(undefined)).toBe("generic");
    expect(normalizeNotificationWebhookFormat("")).toBe("generic");
    expect(normalizeNotificationWebhookFormat("slack")).toBe("slack");
    expect(() => normalizeNotificationWebhookFormat("email")).toThrow("Notification webhook format is invalid");
    expect(notificationWebhookFormatLabel("discord")).toBe("Discord-style webhook");
  });

  it("formats provider-specific webhook payloads without mutating read-only metadata", () => {
    const input = {
      subject: "Read-only alert",
      body: "Observed signal only.",
      payload: {
        source: "juno-wholesale-ops",
        readOnly: true,
        signal: { id: "signal-1", type: "watch_hit" },
      },
      config: { chatId: "-1001" },
    };

    expect(formatNotificationWebhookPayload("generic", input)).toMatchObject({
      source: "juno-wholesale-ops",
      readOnly: true,
      subject: "Read-only alert",
      signal: { id: "signal-1" },
    });
    expect(formatNotificationWebhookPayload("slack", input)).toMatchObject({
      text: "Read-only alert",
      blocks: [expect.objectContaining({ type: "section" })],
      metadata: expect.objectContaining({ readOnly: true }),
    });
    expect(formatNotificationWebhookPayload("discord", input)).toMatchObject({
      content: "Read-only alert",
      allowed_mentions: { parse: [] },
      embeds: [expect.objectContaining({ title: "Read-only alert" })],
    });
    expect(formatNotificationWebhookPayload("telegram", input)).toMatchObject({
      chat_id: "-1001",
      text: expect.stringContaining("Observed signal only."),
      disable_web_page_preview: true,
    });
  });
});
