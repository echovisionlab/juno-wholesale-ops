import { describe, expect, it } from "vitest";
import type { NotificationSignal } from "./types";
import {
  maskNotificationChannelConfig,
  readOnlyNotificationFooter,
  renderDigestNotification,
  renderSignalNotification,
  summarizeNotificationChannelConfig,
} from "./render";

describe("notification rendering", () => {
  it("renders read-only signal and digest notifications without ordering language", () => {
    const rendered = renderSignalNotification(signal());
    const digest = renderDigestNotification({
      digestDate: "2026-06-18",
      digest: {
        generatedAt: "2026-06-18T00:00:00.000Z",
        counts: {
          watchHitsToday: 1,
          lowCatalogStockToday: 2,
          lowLiveStockToday: 3,
          restocksToday: 4,
          fastMoverCandidatesToday: 5,
        },
        topSignals: [],
        topGenres: [
          {
            key: "jazz",
            label: "Jazz",
            currentCount: 9,
            previousCount: 3,
            delta: 6,
            percentChange: 200,
            watchHitCount: 2,
          },
        ],
        topLabels: [],
      },
    });

    expect(rendered.subject).toBe("[Watch hit] Lara Voss - Signal Path");
    expect(rendered.body).toContain(readOnlyNotificationFooter);
    expect(rendered.payload).toMatchObject({
      source: "juno-wholesale-ops",
      readOnly: true,
      signal: { id: "signal-1", type: "watch_hit" },
    });
    expect(digest.subject).toBe("[Operator digest] 2026-06-18");
    expect(digest.body).toContain("Top catalog trend genre: Jazz (9)");
    expect(digest.body).toContain("Top catalog trend label: N/A");
    expect(`${rendered.subject}\n${rendered.body}\n${digest.body}`.toLowerCase()).not.toMatch(
      /cart|checkout|wishlist|ordering|purchase|buy now|auto order|revenue opportunity|sales velocity|best seller|sold/,
    );
  });

  it("labels signal variants and uses safe item fallbacks", () => {
    expect(renderSignalNotification(signal({ type: "trend_spike", title: "Catalog trend spike: Jazz" })).subject).toBe(
      "[Catalog trend] Catalog trend spike: Jazz",
    );
    expect(renderSignalNotification(signal({ type: "low_catalog_stock" })).subject).toContain("[Low observed stock]");
    expect(renderSignalNotification(signal({ type: "observed_restock" })).subject).toContain("[Observed movement]");
    expect(renderSignalNotification(signal({ type: "new_arrival" })).subject).toContain("[Read-only alert]");
    expect(renderSignalNotification(signal({ reasons: [] })).body).toContain("No watch rule reason recorded.");
    expect(renderSignalNotification(signal({ item: { ...signal().item, label: null } })).body).toContain("Label: N/A");
    expect(renderSignalNotification(signal({ type: "trend_spike", title: "" })).subject).toContain("Catalog trend");
    expect(renderSignalNotification(signal({
      title: "",
      item: {
        ...signal().item,
        artist: null,
        title: null,
        junoId: null,
      },
    })).subject).toContain("Catalog item");
  });

  it("masks webhook config and summarizes channel config without exposing secrets", () => {
    const masked = maskNotificationChannelConfig(
      {
        url: "https://hooks.example.test/secret-token",
        headers: {
          Authorization: "Bearer secret",
          "X-Plain": "visible",
        },
        label: "Ops",
      },
      "JUNO_OPS_WEBHOOK_URL",
    );
    const serialized = JSON.stringify(masked);

    expect(serialized).toContain("[configured]");
    expect(serialized).toContain("JUNO_OPS_WEBHOOK_URL");
    expect(serialized).toContain("Ops");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("Bearer secret");
    expect(serialized).not.toContain("visible");
    expect(maskNotificationChannelConfig({ labels: ["ops", "alerts"] }, null)).toEqual({ labels: ["ops", "alerts"] });
    expect(maskNotificationChannelConfig({ url: "" }, null)).toEqual({ url: "[not configured]" });
    expect(summarizeNotificationChannelConfig({ type: "in_app", config: {}, secretRef: null })).toContain("Dashboard-only");
    expect(summarizeNotificationChannelConfig({ type: "logging", config: {}, secretRef: null })).toContain("Console JSON");
    expect(summarizeNotificationChannelConfig({
      type: "webhook",
      config: { url: "https://hooks.example.test/dev", format: "slack" },
      secretRef: null,
    })).toContain("Slack-style webhook configured");
    expect(summarizeNotificationChannelConfig({
      type: "webhook",
      config: { format: "discord" },
      secretRef: "DISCORD_WEBHOOK_URL",
    })).toContain("Discord-style webhook from DISCORD_WEBHOOK_URL");
    expect(summarizeNotificationChannelConfig({ type: "webhook", config: {}, secretRef: null })).toContain("not configured");
  });
});

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
