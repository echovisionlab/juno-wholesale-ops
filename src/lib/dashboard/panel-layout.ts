export type DashboardPanelId =
  | "configuration"
  | "apiIssues"
  | "signalFilters"
  | "ingestionPipeline"
  | "commands"
  | "mailIngest"
  | "todaySignals"
  | "watchRules"
  | "movementSignals"
  | "operatorDigest"
  | "catalogTrends"
  | "notificationCenter"
  | "notificationRules"
  | "notificationChannels"
  | "liveStockWatch"
  | "workerControls";

export type DashboardPanelDefinition = {
  id: DashboardPanelId;
  label: string;
  pinned?: boolean;
  explanation?: {
    dataSource: string;
    calculation: string;
    expectation: string;
  };
};

export type DashboardPanelLayout = {
  schemaVersion: 1;
  hiddenPanelIds: DashboardPanelId[];
};

export const dashboardPanelLayoutStorageKey = "juno-wholesale-ops:dashboard-panel-layout:v1";

export const dashboardPanelDefinitions: DashboardPanelDefinition[] = [
  { id: "configuration", label: "Configuration", pinned: true },
  { id: "apiIssues", label: "API issues", pinned: true },
  { id: "signalFilters", label: "Signal filters", pinned: true },
  { id: "ingestionPipeline", label: "Ingestion pipeline" },
  { id: "commands", label: "Commands" },
  { id: "mailIngest", label: "Mail ingest state" },
  {
    id: "todaySignals",
    label: "Today signals",
    explanation: {
      dataSource: "Today signal events joined to catalog rows and watch-match reasons.",
      calculation: "Groups arrival, watch, low-stock, and exclude signals after the selected filters are applied.",
      expectation: "Use this panel for same-day review queues, not historical demand claims.",
    },
  },
  { id: "watchRules", label: "Watch rules" },
  {
    id: "movementSignals",
    label: "Movement signals",
    explanation: {
      dataSource: "Live observation comparisons from read-only catalog checks.",
      calculation: "Highlights restocks, stock drops, low-stock states, price changes, and fast-mover proxy candidates.",
      expectation: "Treat movement as an operational hint; confirm details before acting outside this app.",
    },
  },
  {
    id: "operatorDigest",
    label: "Operator digest",
    explanation: {
      dataSource: "Today's signal counts combined with movement and trend summaries.",
      calculation: "Rolls review-worthy signals into a compact operator handoff.",
      expectation: "Use it to decide what to inspect next, not as an automated ordering recommendation.",
    },
  },
  {
    id: "catalogTrends",
    label: "Catalog trends",
    explanation: {
      dataSource: "Current and previous catalog snapshot windows.",
      calculation: "Compares genre, label, and watch-overlap buckets between snapshots.",
      expectation: "Use trend direction as context for catalog review, not sales-volume evidence.",
    },
  },
  { id: "notificationCenter", label: "Notification center" },
  { id: "notificationRules", label: "Notification rules" },
  { id: "notificationChannels", label: "Notification channels" },
  { id: "liveStockWatch", label: "Live stock watch" },
  { id: "workerControls", label: "Worker controls" },
];

const defaultDashboardPanelOrder = dashboardPanelDefinitions.map((definition) => definition.id);
const pinnedDashboardPanelIds = dashboardPanelDefinitions
  .filter((definition) => definition.pinned)
  .map((definition) => definition.id);
export const optionalDashboardPanelDefinitions = dashboardPanelDefinitions.filter((definition) => !definition.pinned);
const optionalDashboardPanelIds = optionalDashboardPanelDefinitions.map((definition) => definition.id);

const knownPanelIds = new Set<DashboardPanelId>(defaultDashboardPanelOrder);
const pinnedPanelIds = new Set<DashboardPanelId>(pinnedDashboardPanelIds);
const optionalPanelIds = new Set<DashboardPanelId>(optionalDashboardPanelIds);

export const defaultDashboardPanelLayout: DashboardPanelLayout = {
  schemaVersion: 1,
  hiddenPanelIds: [],
};

export function normalizeDashboardPanelLayout(value: unknown): DashboardPanelLayout {
  if (!isRecord(value)) {
    return { ...defaultDashboardPanelLayout, hiddenPanelIds: [] };
  }

  const hiddenPanelIds = uniquePanelIds(value.hiddenPanelIds).filter((id) => optionalPanelIds.has(id));

  return {
    schemaVersion: 1,
    hiddenPanelIds,
  };
}

export function isDashboardPanelVisible(layout: DashboardPanelLayout, panelId: DashboardPanelId): boolean {
  if (pinnedPanelIds.has(panelId)) {
    return true;
  }
  return !layout.hiddenPanelIds.includes(panelId);
}

export function isPinnedDashboardPanel(panelId: DashboardPanelId): boolean {
  return pinnedPanelIds.has(panelId);
}

export function getDashboardPanelDefinition(panelId: DashboardPanelId): DashboardPanelDefinition {
  const definition = dashboardPanelDefinitions.find((entry) => entry.id === panelId);
  if (!definition) {
    throw new Error(`Unknown dashboard panel: ${panelId}`);
  }
  return definition;
}

export function getVisibleOptionalDashboardPanelIds(layout: DashboardPanelLayout): DashboardPanelId[] {
  return optionalDashboardPanelIds.filter((panelId) => isDashboardPanelVisible(layout, panelId));
}

export function setVisibleOptionalDashboardPanels(
  layout: DashboardPanelLayout,
  visiblePanelIds: DashboardPanelId[],
): DashboardPanelLayout {
  const visiblePanelIdSet = new Set(visiblePanelIds.filter((panelId) => optionalPanelIds.has(panelId)));
  return normalizeDashboardPanelLayout({
    ...layout,
    hiddenPanelIds: optionalDashboardPanelIds.filter((panelId) => !visiblePanelIdSet.has(panelId)),
  });
}

export function readDashboardPanelLayout(serialized: string | null): DashboardPanelLayout {
  if (!serialized) {
    return normalizeDashboardPanelLayout(null);
  }
  try {
    return normalizeDashboardPanelLayout(JSON.parse(serialized));
  } catch {
    return normalizeDashboardPanelLayout(null);
  }
}

function uniquePanelIds(value: unknown): DashboardPanelId[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: DashboardPanelId[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && knownPanelIds.has(entry as DashboardPanelId) && !result.includes(entry as DashboardPanelId)) {
      result.push(entry as DashboardPanelId);
    }
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
