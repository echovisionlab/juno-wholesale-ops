import { describe, expect, it } from "vitest";
import type { DemoCatalogFixture } from "@/lib/demo/fixtures";
import {
  checkMarkdownLocalLinks,
  checkProhibitedCopy,
  checkSecretLikeStrings,
  checkTrackedPaths,
  isLikelyTextPath,
  runPublicSafetyCheck,
  type PublicSafetyTextFile,
} from "./check";

describe("public safety check", () => {
  it("catches tracked env, data, and secrets paths", () => {
    expect(checkTrackedPaths([".env", ".env.local", ".env.example", ".data/raw.xlsx", "secrets/key.json"]))
      .toEqual([
        { code: "tracked-env", path: ".env", message: "tracked env files are not allowed" },
        { code: "tracked-env", path: ".env.local", message: "tracked env files are not allowed" },
        { code: "tracked-data", path: ".data/raw.xlsx", message: "tracked .data files are not allowed" },
        { code: "tracked-secrets", path: "secrets/key.json", message: "tracked secrets files are not allowed" },
      ]);
  });

  it("catches secret-like strings while allowing env examples", () => {
    const issues = checkSecretLikeStrings([
      { path: ".env.example", content: "AUTH_SECRET=" },
      { path: "README.md", content: `Authorization: Bearer ${"abcdefghijklmnop"}` },
      { path: "docs/key.md", content: `-----BEGIN ${"PRIVATE"} KEY-----` },
      { path: "docs/google.md", content: `{"private_${"key"}":"-----${"BEGIN"} PRIVATE KEY-----"}` },
      { path: "docs/github.md", content: `ghp_${"abcdefghijklmnopqrstuvwxyz"}` },
      { path: "docs/google-api.md", content: `AIza${"abcdefghijklmnopqrstuvwxyz"}` },
      { path: "docs/slack.md", content: `xoxb-${"abcdefghijklmnopqrst"}` },
      { path: "docs/hook.md", content: `https://hooks.slack.com/services/${"AAA/BBB/CCC"}` },
      { path: "docs/discord.md", content: `https://discord.com/api/webhooks/${"123/abc"}` },
    ]);

    expect(issues.map((issue) => issue.code)).toEqual(Array.from({ length: 9 }, () => "secret-like-string"));
  });

  it("catches unsafe demo fixtures and missing release readiness files", () => {
    const issues = runPublicSafetyCheck({
      trackedFiles: ["README.md", "LICENSE"],
      textFiles: [
        { path: "README.md", content: "# Title\n\n## What it is\n" },
        { path: "docs/PROJECT_BOUNDARIES.md", content: "" },
        { path: ".github/pull_request_template.md", content: "" },
      ],
      demoFixtures: [
        fixture({
          junoId: "12345",
          catNo: "REAL-1",
          barcode: "123456789012",
          artist: "Real Artist",
          title: "Real Title",
          label: "Real Label",
        }),
        { ...fixture({}), catalog: { ...fixture({}).catalog, rowCount: 0, items: [] } },
      ],
      exists: (file) => file === "README.md" || file === "LICENSE",
    });

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "missing-release-file",
      "missing-required-section",
      "unsafe-demo-fixture",
    ]));
    expect(issues).toContainEqual({
      code: "unsafe-demo-fixture",
      path: "demo/fixtures/catalog/in-stock-demo.xlsx",
      message: "fixture must include at least one catalog row",
    });
  });

  it("passes complete release readiness content", () => {
    const requiredFiles = [
      "LICENSE",
      "SECURITY.md",
      "PRIVACY.md",
      "CONTRIBUTING.md",
      "CODE_OF_CONDUCT.md",
      "docs/PROJECT_BOUNDARIES.md",
      "docs/LOCAL_FIRST.md",
      "docs/DEMO_DATA.md",
      "docs/SELF_HOSTING.md",
      "docs/OPERATIONS.md",
      "docs/RELEASE_CHECKLIST.md",
      "docs/ADAPTER_GUIDE.md",
      "docs/SCREENSHOTS.md",
      ".github/ISSUE_TEMPLATE/bug_report.md",
      ".github/ISSUE_TEMPLATE/feature_request.md",
      ".github/pull_request_template.md",
      "demo/fixtures/catalog/preorders-demo.xlsx",
      "demo/fixtures/catalog/in-stock-demo.xlsx",
    ];
    const readmeSections = [
      "## What it is",
      "## What it does not do",
      "## Features",
      "## Read-only boundary",
      "## Architecture",
      "## Quick start",
      "## Demo mode",
      "## Configuration",
      "## Gmail ingestion",
      "## Live stock observation",
      "## Insights",
      "## Notifications",
      "## Self-hosting",
      "## Privacy and security",
      "## Contributing",
      "## License",
    ].join("\n");
    const issues = runPublicSafetyCheck({
      trackedFiles: ["README.md", ...requiredFiles],
      textFiles: [
        { path: "README.md", content: readmeSections },
        {
          path: "docs/PROJECT_BOUNDARIES.md",
          content: [
            "read-only catalog intelligence",
            "does not call cart, wishlist, checkout, or ordering endpoints",
            "observed stock or status changes are not evidence of actual sales volume",
          ].join("\n"),
        },
        {
          path: ".github/pull_request_template.md",
          content: [
            "No ordering automation added",
            "No cart/wishlist/checkout action added",
            "No real wholesale data committed",
            "No secrets committed",
            "pnpm validate passed",
          ].join("\n"),
        },
      ],
      demoFixtures: [fixture({})],
      exists: () => true,
    });

    expect(issues).toEqual([]);
  });

  it("reports missing document content when markdown files are absent", () => {
    const issues = runPublicSafetyCheck({
      trackedFiles: [],
      textFiles: [],
      demoFixtures: [],
      exists: () => false,
    });

    expect(issues.map((issue) => issue.code)).toContain("missing-required-section");
  });

  it("checks markdown local links, prohibited copy, and text path selection", () => {
    const textFiles: PublicSafetyTextFile[] = [
      { path: "README.md", content: "[ok](docs/OK.md) [missing](docs/MISSING.md) [external](https://example.test)" },
      { path: "docs/ABS.md", content: "[root](/README.md) [anchor](#top) [](   )" },
      { path: "docs/OK.md", content: "ok" },
      { path: "docs/COPY.md", content: "This phrase says order now." },
      { path: "src/components/example.test.tsx", content: "buy" },
      { path: "src/components/example.tsx", content: "Observed signal" },
      { path: "src/lib/public-safety/check.ts", content: "order now" },
    ];

    expect(checkMarkdownLocalLinks(textFiles, (file) => file === "docs/OK.md" || file === "README.md")).toEqual([
      { code: "broken-local-link", path: "README.md", message: "broken local link: docs/MISSING.md" },
    ]);
    expect(checkProhibitedCopy(textFiles)).toEqual([
      { code: "prohibited-copy", path: "docs/COPY.md", message: "prohibited public copy phrase found" },
    ]);
    expect(isLikelyTextPath("README.md")).toBe(true);
    expect(isLikelyTextPath("demo/fixtures/catalog/in-stock-demo.xlsx")).toBe(false);
  });
});

function fixture(overrides: Partial<DemoCatalogFixture["catalog"]["items"][number]>): DemoCatalogFixture {
  return {
    relativePath: "demo/fixtures/catalog/in-stock-demo.xlsx",
    filename: "in-stock-demo.xlsx",
    sha256: "sha",
    bytes: Buffer.from("demo"),
    catalog: {
      kind: "in_stock",
      sheetName: "Synthetic Demo",
      catalogDate: "2026-06-18",
      contentHash: "hash",
      rowCount: 1,
      items: [
        {
          rowNumber: 2,
          junoId: "demo-1",
          artist: "Demo Artist",
          title: "Example Title",
          label: "Sample Label",
          catNo: "DEMO-1",
          barcode: "000000000001",
          medium: "LP",
          description: "Synthetic row",
          genre: "Deep House",
          dealerExVatText: "9.99",
          dealerPriceGbp: 9.99,
          releaseDate: "2026-06-18",
          stock: 1,
          maxOrder: 1,
          raw: {},
          ...overrides,
        },
      ],
    },
  };
}
