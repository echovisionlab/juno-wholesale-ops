import { describe, expect, it } from "vitest";
import {
  dashboardPanelDefinitions,
  getDashboardPanelDefinition,
  getVisibleOptionalDashboardPanelIds,
  isDashboardPanelVisible,
  isPinnedDashboardPanel,
  normalizeDashboardPanelLayout,
  optionalDashboardPanelDefinitions,
  readDashboardPanelLayout,
  setVisibleOptionalDashboardPanels,
} from "./panel-layout";

describe("dashboard panel layout", () => {
  it("normalizes unknown, duplicate, and pinned hidden panel ids", () => {
    const layout = normalizeDashboardPanelLayout({
      schemaVersion: 99,
      hiddenPanelIds: ["configuration", "todaySignals", "missing"],
    });

    expect(layout.schemaVersion).toBe(1);
    expect(layout.hiddenPanelIds).toEqual(["todaySignals"]);
    expect(isDashboardPanelVisible(layout, "configuration")).toBe(true);
    expect(isDashboardPanelVisible(layout, "todaySignals")).toBe(false);
  });

  it("updates optional visibility without hiding pinned panels", () => {
    const layout = setVisibleOptionalDashboardPanels(normalizeDashboardPanelLayout(null), ["todaySignals", "catalogTrends"]);

    expect(getVisibleOptionalDashboardPanelIds(layout)).toEqual(["todaySignals", "catalogTrends"]);
    expect(isDashboardPanelVisible(layout, "signalFilters")).toBe(true);
    expect(isPinnedDashboardPanel("signalFilters")).toBe(true);
    expect(isDashboardPanelVisible(layout, "watchRules")).toBe(false);
  });

  it("keeps panel metadata in one registry", () => {
    expect(getDashboardPanelDefinition("todaySignals")).toMatchObject({
      id: "todaySignals",
      label: "Today signals",
    });
    expect(optionalDashboardPanelDefinitions.map((definition) => definition.id)).toEqual(
      dashboardPanelDefinitions.filter((definition) => !definition.pinned).map((definition) => definition.id),
    );
  });

  it("reads serialized layout defensively", () => {
    expect(readDashboardPanelLayout("{bad json")).toMatchObject({ hiddenPanelIds: [] });
    expect(readDashboardPanelLayout(JSON.stringify({ hiddenPanelIds: ["commands"] }))).toMatchObject({
      hiddenPanelIds: ["commands"],
    });
  });
});
