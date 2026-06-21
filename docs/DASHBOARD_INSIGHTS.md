# Dashboard Insights

Dashboard insight panels must be read-only aggregate views. They should explain what was counted, the comparison window, and the limits of the interpretation.

## Data Contract

Add new insight panels through a server-side aggregate repository, not by deriving statistics from bounded client arrays.

Recommended shape:

```ts
type InsightPanel = {
  id: string;
  kind: "trend" | "expectation" | "data_quality" | "watch_overlap" | "movement";
  title: string;
  summary: string;
  generatedAt: string;
  window: { from: string; to: string; previousFrom?: string; previousTo?: string };
  metrics: Array<{ label: string; value: number | string; unit?: string; denominator?: string }>;
  expectation?: {
    horizonDays: number;
    label: string;
    confidence: "low" | "medium" | "high";
    caveat: string;
  };
  method: {
    name: string;
    version: string;
    formula: string;
    dataSources: string[];
    assumptions: string[];
    limitations: string[];
  };
  evidence: Array<{ label: string; value: string | number; signalIds?: string[] }>;
  safety: { readOnly: true; observedEvidenceOnly: true };
};
```

## Calculation Rules

- Compute aggregate metrics in `src/lib/insights/*` from Postgres or existing repositories.
- Clamp API params such as `windowDays`, `previousWindowDays`, `horizonDays`, and `limit`.
- Use synthetic tests only. Do not add real wholesale data, raw mail payloads, OAuth tokens, webhook URLs, or service account JSON.
- Use "expectation" wording for future-looking panels. Do not present commercial conclusions.
- Include method metadata for any metric that can be misread. For example, catalog trend counts are catalog row observations, and watch matches are rule-match rows.

## Dashboard Compatibility

Dashboard saved views currently persist signal filters only. Do not store panel layout inside `DashboardSignalFilters`.

Panel show/hide behavior is controlled by the dashboard panel registry in `src/lib/dashboard/panel-layout.ts`.

- Pinned panels stay visible: Configuration, API issues, Signal filters.
- Optional panels can be hidden locally without changing saved-view DB records.
- Future DB-backed layouts that need shared order or per-user preferences should use a separate `panel_layout` column or user-scoped preference table.
- Legacy saved views must continue to load with default panels.

## First Useful Panels

- Catalog mix shift: current vs previous catalog rows by genre or label.
- Watch concentration: watch-rule matches per catalog row, with match counts labelled separately from unique items.
- Movement expectation: low-stock or stock-drop risk based only on live observations.
- Data freshness: latest snapshot, latest live observation, sparse-data warnings, and observation coverage.
