import { describe, expect, it } from "vitest";
import {
  notificationChannelPayload,
  notificationChannelToDraft,
  notificationProviderFromKey,
  ssoProviderPayload,
} from "./settings-utils";
import type { NotificationChannel } from "@/lib/notifications/types";

describe("settings notification utils", () => {
  it("builds SSO provider payloads without raw client secrets", () => {
    const draft = {
      providerId: "workspace",
      displayName: "Workspace",
      protocol: "oidc" as const,
      preset: "custom_oidc" as const,
      buttonLabel: "Continue with Workspace",
      logoUrl: "",
      discoveryUrl: "https://login.example.test/.well-known/openid-configuration",
      authorizationUrl: "",
      tokenUrl: "",
      userInfoUrl: "",
      clientId: "client-id",
      clientSecretRef: "env:WORKSPACE_CLIENT_SECRET",
      scopes: "openid email profile",
      enabled: true,
      sortOrder: 0,
      adminEmailAllowlist: "",
      adminClaim: "",
      adminClaimValue: "",
    };

    expect(ssoProviderPayload(draft, null)).toMatchObject({
      providerId: "workspace",
      clientSecretRef: "env:WORKSPACE_CLIENT_SECRET",
    });
    expect(ssoProviderPayload({ ...draft, clientSecretRef: "" }, "provider-1")).toMatchObject({
      id: "provider-1",
      providerId: "workspace",
    });
    expect(ssoProviderPayload({ ...draft, clientSecretRef: "" }, "provider-1")).not.toHaveProperty("clientSecretRef");
    expect(ssoProviderPayload(draft, null)).not.toHaveProperty("clientSecret");
  });

  it("maps notification provider selections to safe channel payloads", () => {
    expect(notificationProviderFromKey("webhook_slack")).toEqual({ type: "webhook", format: "slack" });

    expect(notificationChannelPayload({
      name: "Slack ops",
      type: "webhook",
      provider: "webhook_slack",
      webhookFormat: "slack",
      enabled: true,
      webhookUrl: "https://hooks.example.test/dev",
      telegramChatId: "",
      secretRef: "SLACK_WEBHOOK_URL",
    }, false)).toMatchObject({
      name: "Slack ops",
      type: "webhook",
      config: {
        format: "slack",
        url: "https://hooks.example.test/dev",
      },
      secretRef: "SLACK_WEBHOOK_URL",
    });

    expect(notificationChannelPayload({
      name: "Telegram ops",
      type: "webhook",
      provider: "webhook_telegram",
      webhookFormat: "telegram",
      enabled: true,
      webhookUrl: "",
      telegramChatId: "-1001",
      secretRef: "TELEGRAM_WEBHOOK_URL",
    }, true)).toMatchObject({
      type: "webhook",
      config: {
        format: "telegram",
        chatId: "-1001",
      },
    });
  });

  it("hydrates masked channels without exposing hidden webhook URL values", () => {
    expect(notificationChannelToDraft(channel({
      config: {
        format: "discord",
        url: "[configured]",
      },
    }))).toMatchObject({
      provider: "webhook_discord",
      webhookFormat: "discord",
      webhookUrl: "",
    });
  });
});

function channel(overrides: Partial<NotificationChannel> = {}): NotificationChannel {
  return {
    id: "channel-1",
    name: "Ops webhook",
    type: "webhook",
    enabled: true,
    config: {},
    secretRef: null,
    configSummary: "Generic webhook configured for local development",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    ...overrides,
  };
}
