import fs from "node:fs";
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
      { path: ".env.example", content: "DATABASE_URL=" },
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

  it("rejects non-string package versions", () => {
    const issues = runPublicSafetyCheck({
      trackedFiles: [],
      textFiles: [
        {
          path: "package.json",
          content: JSON.stringify({
            version: 1,
            scripts: { validate: "pnpm public:safety" },
          }),
        },
      ],
      demoFixtures: [],
      exists: () => false,
    });

    expect(issues).toContainEqual({
      code: "missing-required-section",
      path: "package.json",
      message: "package version must be valid semver",
    });
  });

  it("passes complete release readiness content", () => {
    const requiredFiles = [
      "LICENSE",
      "SECURITY.md",
      "PRIVACY.md",
      "CONTRIBUTING.md",
      "CODE_OF_CONDUCT.md",
      "CHANGELOG.md",
      "docs/PROJECT_BOUNDARIES.md",
      "docs/LOCAL_FIRST.md",
      "docs/DEMO_DATA.md",
      "docs/SELF_HOSTING.md",
      "docs/OPERATIONS.md",
      "docs/RELEASE_CHECKLIST.md",
      "docs/RELEASE_NOTES_v0.1.0.md",
      "docs/PUBLIC_REPOSITORY_CHECKLIST.md",
      "docs/ROADMAP.md",
      "docs/ADAPTER_GUIDE.md",
      "docs/SCREENSHOTS.md",
      ".github/ISSUE_TEMPLATE/bug_report.md",
      ".github/ISSUE_TEMPLATE/feature_request.md",
      ".github/pull_request_template.md",
      "demo/fixtures/README.md",
      "scripts/demo-seed.ts",
      "scripts/demo-reset.ts",
      "scripts/check-public-safety.ts",
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
      "## Synthetic fixture seed",
      "## Configuration",
      "## Mail ingestion",
      "## Live stock observation",
      "## Insights",
      "## Notifications",
      "## Self-hosting",
      "## Release docs",
      "## Privacy and security",
      "## Contributing",
      "## License",
      "[CHANGELOG.md](CHANGELOG.md)",
      "[docs/RELEASE_NOTES_v0.1.0.md](docs/RELEASE_NOTES_v0.1.0.md)",
      "[docs/PUBLIC_REPOSITORY_CHECKLIST.md](docs/PUBLIC_REPOSITORY_CHECKLIST.md)",
      "[docs/ROADMAP.md](docs/ROADMAP.md)",
      "This repository is a self-hosted application. It is not intended to be",
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
          path: "CHANGELOG.md",
          content: [
            "## 0.1.0",
            "No cart actions.",
            "No auto-ordering.",
            "No checkout automation.",
            "No sales-volume claims without observed evidence.",
          ].join("\n"),
        },
        {
          path: "docs/RELEASE_NOTES_v0.1.0.md",
          content: [
            "This release does not automate ordering, cart actions, wishlist actions, checkout flows, or purchase decisions.",
            "이 릴리즈는 자동 주문, 장바구니 조작, 위시리스트 조작, 체크아웃 흐름, 구매 결정을 자동화하지 않습니다.",
          ].join("\n"),
        },
        {
          path: "docs/PUBLIC_REPOSITORY_CHECKLIST.md",
          content: [
            "Required status checks: Quality, Tests, Build",
            "Secret scanning is enabled",
            "Dependabot alerts are enabled",
            "Dependabot open alerts are zero",
            "GitHub Actions permissions are minimal",
            "No production secrets in repository",
            "No real wholesale data in repository",
            "Synthetic fixture workbooks only",
            "Runtime dependency audit passes",
          ].join("\n"),
        },
        {
          path: "SECURITY.md",
          content: [
            "## Dependency Vulnerability Handling",
            "Dependabot alerts should be reduced to zero",
            "accepted risk",
          ].join("\n"),
        },
        {
          path: "docs/ROADMAP.md",
          content: [
            "## Not planned",
            "Auto-ordering",
            "Cart automation",
            "Checkout automation",
            "Wishlist mutation",
            "Sales-volume inference",
          ].join("\n"),
        },
        {
          path: "package.json",
          content: JSON.stringify({
            version: "0.2.0",
            scripts: { validate: "pnpm lint && pnpm public:safety" },
          }),
        },
        {
          path: ".github/workflows/ci.yml",
          content: "name: CI\n\n- name: Public safety check\n  run: pnpm public:safety\n",
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

  it("validates current release candidate documents and workflow wiring", () => {
    const read = (path: string) => fs.readFileSync(path, "utf8");
    const readme = read("README.md");
    const changelog = read("CHANGELOG.md");
    const releaseNotes = read("docs/RELEASE_NOTES_v0.1.0.md");
    const repositoryChecklist = read("docs/PUBLIC_REPOSITORY_CHECKLIST.md");
    const roadmap = read("docs/ROADMAP.md");
    const security = read("SECURITY.md");
    const packageJson = JSON.parse(read("package.json")) as {
      version?: string;
      scripts?: Record<string, string>;
    };
    const ciWorkflow = read(".github/workflows/ci.yml");

    expect(readme).toContain("[CHANGELOG.md](CHANGELOG.md)");
    expect(readme).toContain("[docs/RELEASE_NOTES_v0.1.0.md](docs/RELEASE_NOTES_v0.1.0.md)");
    expect(readme).toContain("[docs/ROADMAP.md](docs/ROADMAP.md)");
    expect(changelog).toContain("## 0.1.0");
    expect(changelog).toContain("No cart actions.");
    expect(changelog).toContain("No auto-ordering.");
    expect(changelog).toContain("No checkout automation.");
    expect(changelog).toContain("No sales-volume claims without observed evidence.");
    expect(releaseNotes).toContain(
      "This release does not automate ordering, cart actions, wishlist actions, checkout flows, or purchase decisions.",
    );
    expect(repositoryChecklist).toContain("Secret scanning is enabled");
    expect(repositoryChecklist).toContain("Dependabot open alerts are zero");
    expect(repositoryChecklist).toContain("No production secrets in repository");
    expect(repositoryChecklist).toContain("No real wholesale data in repository");
    expect(security).toContain("## Dependency Vulnerability Handling");
    expect(security).toContain("Dependabot alerts should be reduced to zero");
    expect(roadmap).toContain("## Not planned");
    expect(roadmap).toContain("Auto-ordering");
    expect(roadmap).toContain("Cart automation");
    expect(roadmap).toContain("Checkout automation");
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageJson.scripts?.validate).toContain("pnpm public:safety");
    expect(ciWorkflow).toContain("Public safety check");
    expect(ciWorkflow).toContain("pnpm public:safety");
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
