import { describe, expect, it } from "vitest";
import {
  buildDigestDeliveryKey,
  buildSignalDeliveryKey,
  notificationRuleMatchesSignal,
  shouldSkipForCooldown,
} from "./matcher";
import { parseNotificationScriptOptions } from "./script-options";
import type { NotificationRule, NotificationSignal } from "./types";

describe("notification matcher", () => {
  it("matches rules by type, severity, score, and watch-hit inclusion", () => {
    const rule = notificationRule({
      signalTypes: ["watch_hit"],
      severities: ["watch"],
      minScore: 10,
    });

    expect(notificationRuleMatchesSignal(rule, signal({ score: 10 }))).toBe(true);
    expect(notificationRuleMatchesSignal(rule, signal({ type: "new_arrival" }))).toBe(false);
    expect(notificationRuleMatchesSignal(rule, signal({ severity: "warning" }))).toBe(false);
    expect(notificationRuleMatchesSignal(rule, signal({ score: 9 }))).toBe(false);
    expect(notificationRuleMatchesSignal({ ...rule, includeWatchHits: false }, signal())).toBe(false);
    expect(notificationRuleMatchesSignal({ ...rule, enabled: false }, signal())).toBe(false);
    expect(notificationRuleMatchesSignal({ ...rule, channelEnabled: false }, signal())).toBe(false);
    expect(notificationRuleMatchesSignal(notificationRule({ signalTypes: [], severities: [], minScore: -10 }), signal())).toBe(true);
  });

  it("builds deterministic keys and skips same rule identity signal within cooldown", () => {
    const rule = notificationRule({ cooldownMinutes: 30 });
    const currentSignal = signal({
      item: {
        ...signal().item,
        identityId: "identity-1",
      },
    });

    expect(buildSignalDeliveryKey({
      ruleId: "rule-1",
      channelId: "channel-1",
      signalEventId: "signal-1",
    })).toBe("signal:rule-1:channel-1:signal-1");
    expect(buildDigestDeliveryKey({
      ruleId: "rule-1",
      channelId: "channel-1",
      digestDate: "2026-06-18",
    })).toBe("digest:rule-1:channel-1:2026-06-18");
    expect(
      shouldSkipForCooldown({
        rule,
        signal: currentSignal,
        deliveries: [],
      }),
    ).toBe(false);
    expect(
      shouldSkipForCooldown({
        rule,
        signal: currentSignal,
        now: new Date("2026-06-18T01:00:00.000Z"),
        deliveries: [
          {
            ruleId: "rule-1",
            identityId: "identity-1",
            signalType: "watch_hit",
            queuedAt: "2026-06-18T00:45:00.000Z",
            status: "queued",
          },
        ],
      }),
    ).toBe(true);
    expect(
      shouldSkipForCooldown({
        rule,
        signal: currentSignal,
        now: new Date("2026-06-18T01:00:00.000Z"),
        deliveries: [
          {
            ruleId: "rule-1",
            identityId: "identity-1",
            signalType: "watch_hit",
            queuedAt: "2026-06-18T00:00:00.000Z",
            status: "sent",
          },
          {
            ruleId: "rule-1",
            identityId: "identity-1",
            signalType: "watch_hit",
            queuedAt: "2026-06-18T00:55:00.000Z",
            status: "failed",
          },
        ],
      }),
    ).toBe(false);
    expect(
      shouldSkipForCooldown({
        rule,
        signal: currentSignal,
        now: new Date("2026-06-18T01:00:00.000Z"),
        deliveries: [
          {
            ruleId: "other-rule",
            identityId: "identity-1",
            signalType: "watch_hit",
            queuedAt: "2026-06-18T00:55:00.000Z",
            status: "queued",
          },
          {
            ruleId: "rule-1",
            identityId: "other-identity",
            signalType: "watch_hit",
            queuedAt: "2026-06-18T00:55:00.000Z",
            status: "queued",
          },
        ],
      }),
    ).toBe(false);
    expect(
      shouldSkipForCooldown({
        rule: { ...rule, cooldownMinutes: 0 },
        signal: currentSignal,
        deliveries: [],
      }),
    ).toBe(false);
    expect(
      shouldSkipForCooldown({
        rule,
        signal: signal({ item: { ...currentSignal.item, identityId: null } }),
        deliveries: [],
      }),
    ).toBe(false);
  });

  it("parses notification script dispatch options with dry-run defaults", () => {
    expect(parseNotificationScriptOptions([])).toEqual({ mode: "dry-run", limit: undefined });
    expect(parseNotificationScriptOptions(["--send", "--limit", "25"])).toEqual({ mode: "send", limit: 25 });
    expect(parseNotificationScriptOptions(["--limit", "0"])).toEqual({ mode: "dry-run", limit: undefined });
    expect(parseNotificationScriptOptions(["--limit"])).toEqual({ mode: "dry-run", limit: undefined });
  });
});

function notificationRule(overrides: Partial<NotificationRule> = {}): NotificationRule {
  return {
    id: "rule-1",
    name: "Rule",
    channelId: "channel-1",
    channelName: "In-app notifications",
    channelType: "in_app",
    channelEnabled: true,
    enabled: true,
    signalTypes: [],
    severities: [],
    minScore: 0,
    includeWatchHits: true,
    includeDigest: false,
    cooldownMinutes: 60,
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
    ...overrides,
  };
}

function signal(overrides: Partial<NotificationSignal> = {}): NotificationSignal {
  return {
    signalId: "signal-1",
    type: "watch_hit",
    severity: "watch",
    score: 15,
    title: "Watch hit: Lara Voss - Signal Path",
    detail: "Observed catalog row matched 1 watch rule(s).",
    createdAt: "2026-06-18T00:00:00.000Z",
    metadata: {},
    item: {
      identityId: "identity-1",
      junoId: "1148569-01",
      artist: "Lara Voss",
      title: "Signal Path",
      label: "Blue Note",
      catNo: "BN-101",
      genre: "Jazz",
      medium: "LP",
      stock: 2,
      dealerPriceGbp: "10.00",
      releaseDate: "2026-06-21",
    },
    reasons: ['Label exactly matches "Blue Note".'],
    ...overrides,
  };
}
