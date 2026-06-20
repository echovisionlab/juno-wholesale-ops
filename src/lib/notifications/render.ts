import type { InsightDigest, TrendBucket } from "@/lib/insights/trend-repository";
import type {
  NotificationChannelType,
  NotificationConfig,
  NotificationSignal,
} from "./types";
import {
  normalizeNotificationWebhookFormat,
  notificationWebhookFormatLabel,
} from "./provider-formatters";

export const readOnlyNotificationFooter =
  "This is an informational read-only observation for operator review only.";

const sensitiveConfigKeyPattern = /(url|webhook|authorization|auth|header|token|secret|password|cookie)/i;

export function renderSignalNotification(signal: NotificationSignal): {
  subject: string;
  body: string;
  payload: NotificationConfig;
} {
  const signalLabel = signalTypeLabel(signal.type);
  const displayName = itemDisplayName(signal);
  const subject = `[${signalLabel}] ${displayName}`;
  const reason = signal.reasons.length > 0 ? signal.reasons.join(" ") : "No watch rule reason recorded.";
  const body = [
    "Read-only signal from Juno Wholesale Ops.",
    "",
    `Signal: ${signal.type}`,
    `Severity: ${signal.severity}`,
    `Score: ${signal.score}`,
    `Item: ${displayName}`,
    `Label: ${signal.item.label ?? "N/A"}`,
    `Reason: ${reason}`,
    "",
    readOnlyNotificationFooter,
  ].join("\n");

  return {
    subject,
    body,
    payload: {
      source: "juno-wholesale-ops",
      readOnly: true,
      subject,
      body,
      signal: {
        id: signal.signalId,
        type: signal.type,
        severity: signal.severity,
        score: signal.score,
        createdAt: signal.createdAt,
      },
      item: {
        identityId: signal.item.identityId,
        junoId: signal.item.junoId,
        artist: signal.item.artist,
        title: signal.item.title,
        label: signal.item.label,
        genre: signal.item.genre,
        catNo: signal.item.catNo,
      },
      reasons: signal.reasons,
    },
  };
}

export function renderDigestNotification(input: {
  digest: InsightDigest;
  digestDate: string;
}): {
  subject: string;
  body: string;
  payload: NotificationConfig;
} {
  const subject = `[Operator digest] ${input.digestDate}`;
  const topGenre = firstBucketLabel(input.digest.topGenres);
  const topLabel = firstBucketLabel(input.digest.topLabels);
  const body = [
    "Read-only operator digest from Juno Wholesale Ops.",
    "",
    `Digest date: ${input.digestDate}`,
    `Watch hits today: ${input.digest.counts.watchHitsToday}`,
    `Low catalog stock: ${input.digest.counts.lowCatalogStockToday}`,
    `Low live stock: ${input.digest.counts.lowLiveStockToday}`,
    `Restock observations: ${input.digest.counts.restocksToday}`,
    `Fast mover candidates: ${input.digest.counts.fastMoverCandidatesToday}`,
    `Top catalog trend genre: ${topGenre}`,
    `Top catalog trend label: ${topLabel}`,
    "",
    readOnlyNotificationFooter,
  ].join("\n");

  return {
    subject,
    body,
    payload: {
      source: "juno-wholesale-ops",
      readOnly: true,
      subject,
      body,
      digest: {
        date: input.digestDate,
        generatedAt: input.digest.generatedAt,
        counts: input.digest.counts,
        topGenres: input.digest.topGenres,
        topLabels: input.digest.topLabels,
      },
    },
  };
}

export function maskNotificationChannelConfig(config: NotificationConfig, secretRef: string | null): NotificationConfig {
  const masked = maskConfigValue(config, "") as NotificationConfig;
  if (secretRef) {
    return {
      ...masked,
      secretRef,
      secretConfigured: true,
    };
  }
  return masked;
}

export function summarizeNotificationChannelConfig(input: {
  type: NotificationChannelType;
  config: NotificationConfig;
  secretRef: string | null;
}): string {
  if (input.type === "in_app") {
    return "Dashboard-only read-only alerts";
  }
  if (input.type === "logging") {
    return "Console JSON read-only alert log";
  }
  if (input.secretRef) {
    return `${notificationWebhookFormatLabel(normalizeNotificationWebhookFormat(input.config.format))} from ${input.secretRef}`;
  }
  return typeof input.config.url === "string" && input.config.url.trim()
    ? `${notificationWebhookFormatLabel(normalizeNotificationWebhookFormat(input.config.format))} configured for local development`
    : `${notificationWebhookFormatLabel(normalizeNotificationWebhookFormat(input.config.format))} not configured`;
}

function signalTypeLabel(type: NotificationSignal["type"]): string {
  if (type === "watch_hit") {
    return "Watch hit";
  }
  if (type === "trend_spike") {
    return "Catalog trend";
  }
  if (type === "low_catalog_stock" || type === "observed_live_low_stock") {
    return "Low observed stock";
  }
  if (
    type === "observed_restock" ||
    type === "observed_stock_drop" ||
    type === "observed_status_change" ||
    type === "observed_price_change" ||
    type === "fast_mover_candidate"
  ) {
    return "Observed movement";
  }
  return "Read-only alert";
}

function itemDisplayName(signal: NotificationSignal): string {
  if (signal.type === "trend_spike") {
    return signal.title || "Catalog trend";
  }
  const artistTitle = [signal.item.artist, signal.item.title].filter(Boolean).join(" - ");
  return artistTitle || signal.title || signal.item.junoId || "Catalog item";
}

function firstBucketLabel(buckets: TrendBucket[]): string {
  return buckets[0] ? `${buckets[0].label} (${buckets[0].currentCount})` : "N/A";
}

function maskConfigValue(value: unknown, key: string): unknown {
  if (sensitiveConfigKeyPattern.test(key)) {
    return isConfiguredValue(value) ? "[configured]" : "[not configured]";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => maskConfigValue(entry, key));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        maskConfigValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

function isConfiguredValue(value: unknown): boolean {
  if (typeof value === "string") {
    return Boolean(value.trim());
  }
  return value !== null && value !== undefined;
}
