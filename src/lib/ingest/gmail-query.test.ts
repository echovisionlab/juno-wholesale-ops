import { describe, expect, it } from "vitest";
import { buildGmailIngestQueryPlan, removeGmailDateFilters } from "./gmail-query";

describe("buildGmailIngestQueryPlan", () => {
  it("uses the base query when there is no prior successful message cursor", () => {
    const plan = buildGmailIngestQueryPlan({
      baseQuery: " to:inventory@dsub.io   has:attachment  filename:xlsx ",
      lastSuccessfulMessageReceivedAt: null,
      lookbackMs: 604800000,
      now: new Date("2026-06-17T12:00:00.000Z"),
    });

    expect(plan).toEqual({
      query: "to:inventory@dsub.io has:attachment filename:xlsx",
      windowFrom: null,
      windowTo: "2026-06-17T12:00:00.000Z",
      incremental: false,
    });
  });

  it("can build a dry initial plan with the current time", () => {
    const before = Date.now();
    const plan = buildGmailIngestQueryPlan({
      baseQuery: "filename:xlsx",
      lastSuccessfulMessageReceivedAt: undefined,
      lookbackMs: 604800000,
    });
    const after = Date.now();

    expect(plan.query).toBe("filename:xlsx");
    expect(plan.windowFrom).toBeNull();
    expect(Date.parse(plan.windowTo)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(plan.windowTo)).toBeLessThanOrEqual(after);
    expect(plan.incremental).toBe(false);
  });


  it("replaces existing date filters with an overlap window after the last cursor", () => {
    const plan = buildGmailIngestQueryPlan({
      baseQuery: "to:inventory@dsub.io newer_than:30d has:attachment before:2026/06/30 filename:xlsx",
      lastSuccessfulMessageReceivedAt: "2026-06-17T08:30:00.000Z",
      lookbackMs: 48 * 60 * 60 * 1000,
      now: new Date("2026-06-18T00:00:00.000Z"),
    });

    expect(plan).toEqual({
      query: "to:inventory@dsub.io has:attachment filename:xlsx after:2026/06/15",
      windowFrom: "2026-06-15T08:30:00.000Z",
      windowTo: "2026-06-18T00:00:00.000Z",
      incremental: true,
    });
  });

  it("clamps the overlap window to the Unix epoch", () => {
    const plan = buildGmailIngestQueryPlan({
      baseQuery: "filename:xlsx",
      lastSuccessfulMessageReceivedAt: "1970-01-01T00:00:10.000Z",
      lookbackMs: 60000,
      now: new Date("2026-06-18T00:00:00.000Z"),
    });

    expect(plan.windowFrom).toBe("1970-01-01T00:00:00.000Z");
    expect(plan.query).toBe("filename:xlsx after:1970/01/01");
  });
});

describe("removeGmailDateFilters", () => {
  it("normalizes whitespace after removing Gmail date filters", () => {
    expect(removeGmailDateFilters("after:2026/06/01  filename:xlsx older_than:1d subject:Juno")).toBe(
      "filename:xlsx subject:Juno",
    );
  });
});
