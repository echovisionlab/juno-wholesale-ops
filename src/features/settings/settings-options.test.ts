import { describe, expect, it } from "vitest";
import {
  signalEventTypes,
  signalSeverities,
  signalSeverityLabels,
  signalTypeLabels,
} from "@/lib/insights/signal-types";
import {
  notificationSeverityOptions,
  notificationSignalTypeOptions,
} from "./settings-options";

describe("settings options", () => {
  it("derives notification taxonomy options from canonical signal metadata", () => {
    expect(notificationSignalTypeOptions).toEqual(
      signalEventTypes.map((value) => ({
        value,
        label: signalTypeLabels[value],
      })),
    );
    expect(notificationSeverityOptions).toEqual(
      signalSeverities.map((value) => ({
        value,
        label: signalSeverityLabels[value],
      })),
    );
  });
});
