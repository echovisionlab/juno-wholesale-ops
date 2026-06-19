import path from "node:path";
import {
  demoFixtureRelativePaths,
  validateSyntheticDemoCatalogFixtures,
  type DemoCatalogFixture,
} from "@/lib/demo/fixtures";

export type PublicSafetyIssue = {
  code:
    | "tracked-env"
    | "tracked-data"
    | "tracked-secrets"
    | "secret-like-string"
    | "unsafe-demo-fixture"
    | "broken-local-link"
    | "missing-release-file"
    | "missing-required-section"
    | "prohibited-copy";
  path: string;
  message: string;
};

export type PublicSafetyTextFile = {
  path: string;
  content: string;
};

export type PublicSafetyInput = {
  trackedFiles: string[];
  textFiles: PublicSafetyTextFile[];
  demoFixtures: DemoCatalogFixture[];
  exists: (repoRelativePath: string) => boolean;
};

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
  ...demoFixtureRelativePaths,
] as const;

const requiredReadmeSections = [
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
] as const;

const requiredReadmeReleaseLinks = [
  "[CHANGELOG.md](CHANGELOG.md)",
  "[docs/RELEASE_NOTES_v0.1.0.md](docs/RELEASE_NOTES_v0.1.0.md)",
  "[docs/PUBLIC_REPOSITORY_CHECKLIST.md](docs/PUBLIC_REPOSITORY_CHECKLIST.md)",
  "[docs/ROADMAP.md](docs/ROADMAP.md)",
] as const;

const requiredProjectBoundaryPhrases = [
  "read-only catalog intelligence",
  "does not call cart, wishlist, checkout, or ordering endpoints",
  "observed stock or status changes are not evidence of actual sales volume",
] as const;

const requiredChangelogPhrases = [
  "## 0.1.0",
  "No cart actions.",
  "No auto-ordering.",
  "No checkout automation.",
  "No sales-volume claims without observed evidence.",
] as const;

const requiredReleaseNotesPhrases = [
  "This release does not automate ordering, cart actions, wishlist actions, checkout flows, or purchase decisions.",
  "이 릴리즈는 자동 주문, 장바구니 조작, 위시리스트 조작, 체크아웃 흐름, 구매 결정을 자동화하지 않습니다.",
] as const;

const requiredPublicRepositoryChecklistPhrases = [
  "Required status checks: Quality, Tests, Build",
  "Secret scanning is enabled",
  "Dependabot alerts are enabled",
  "Dependabot open alerts are zero",
  "GitHub Actions permissions are minimal",
  "No production secrets in repository",
  "No real wholesale data in repository",
  "Synthetic fixture workbooks only",
  "Runtime dependency audit passes",
] as const;

const requiredSecurityPhrases = [
  "## Dependency Vulnerability Handling",
  "Dependabot alerts should be reduced to zero",
  "accepted risk",
] as const;

const requiredRoadmapPhrases = [
  "## Not planned",
  "Auto-ordering",
  "Cart automation",
  "Checkout automation",
  "Wishlist mutation",
  "Sales-volume inference",
] as const;

const requiredPullRequestChecklist = [
  "No ordering automation added",
  "No cart/wishlist/checkout action added",
  "No real wholesale data committed",
  "No secrets committed",
  "pnpm validate passed",
] as const;

const secretLikePatterns: Array<{ name: string; pattern: RegExp }> = [
  { name: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Google private key", pattern: /"private_key"\s*:\s*"-----BEGIN/i },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { name: "Google API key", pattern: /\bAIza[A-Za-z0-9_-]{20,}\b/ },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/ },
  { name: "webhook URL", pattern: /\bhttps:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/i },
  { name: "webhook URL", pattern: /\bhttps:\/\/discord\.com\/api\/webhooks\/[A-Za-z0-9/_-]+/i },
  { name: "bearer token", pattern: /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{12,}/i },
];

const prohibitedCopyPattern = /\bbuy\b|order now|sold fast|best seller|sales velocity|\brevenue\b|auto order/i;

export function runPublicSafetyCheck(input: PublicSafetyInput): PublicSafetyIssue[] {
  return [
    ...checkTrackedPaths(input.trackedFiles),
    ...checkRequiredFiles(input.trackedFiles),
    ...checkSecretLikeStrings(input.textFiles),
    ...checkDemoFixtureSafety(input.demoFixtures),
    ...checkMarkdownLocalLinks(input.textFiles, input.exists),
    ...checkRequiredDocumentSections(input.textFiles),
    ...checkProhibitedCopy(input.textFiles),
  ];
}

export function checkTrackedPaths(trackedFiles: string[]): PublicSafetyIssue[] {
  const issues: PublicSafetyIssue[] = [];
  for (const file of trackedFiles) {
    if (/^\.env(?:$|\.)/.test(file) && file !== ".env.example") {
      issues.push({ code: "tracked-env", path: file, message: "tracked env files are not allowed" });
    }
    if (file === ".data" || file.startsWith(".data/")) {
      issues.push({ code: "tracked-data", path: file, message: "tracked .data files are not allowed" });
    }
    if (file === "secrets" || file.startsWith("secrets/")) {
      issues.push({ code: "tracked-secrets", path: file, message: "tracked secrets files are not allowed" });
    }
  }
  return issues;
}

function checkRequiredFiles(trackedFiles: string[]): PublicSafetyIssue[] {
  const tracked = new Set(trackedFiles);
  return requiredFiles
    .filter((file) => !tracked.has(file))
    .map((file) => ({
      code: "missing-release-file" as const,
      path: file,
      message: "required open-source release file is missing",
    }));
}

export function checkSecretLikeStrings(textFiles: PublicSafetyTextFile[]): PublicSafetyIssue[] {
  const issues: PublicSafetyIssue[] = [];
  for (const file of textFiles) {
    if (file.path === ".env.example") {
      continue;
    }
    for (const { name, pattern } of secretLikePatterns) {
      if (pattern.test(file.content)) {
        issues.push({
          code: "secret-like-string",
          path: file.path,
          message: `secret-like ${name} pattern found`,
        });
      }
    }
  }
  return issues;
}

function checkDemoFixtureSafety(fixtures: DemoCatalogFixture[]): PublicSafetyIssue[] {
  return validateSyntheticDemoCatalogFixtures(fixtures).map((issue) => ({
    code: "unsafe-demo-fixture",
    path: issue.fixture,
    message: issue.rowNumber ? `row ${issue.rowNumber}: ${issue.message}` : issue.message,
  }));
}

export function checkMarkdownLocalLinks(
  textFiles: PublicSafetyTextFile[],
  exists: (repoRelativePath: string) => boolean,
): PublicSafetyIssue[] {
  const issues: PublicSafetyIssue[] = [];
  for (const file of textFiles.filter((entry) => entry.path.endsWith(".md"))) {
    const links = [...file.content.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g)];
    for (const match of links) {
      const target = normalizeMarkdownTarget(match[1]);
      if (!target || isExternalOrAnchor(target)) {
        continue;
      }
      const resolved = resolveLocalMarkdownTarget(file.path, target);
      if (!exists(resolved)) {
        issues.push({
          code: "broken-local-link",
          path: file.path,
          message: `broken local link: ${target}`,
        });
      }
    }
  }
  return issues;
}

function checkRequiredDocumentSections(textFiles: PublicSafetyTextFile[]): PublicSafetyIssue[] {
  const issues: PublicSafetyIssue[] = [];
  const byPath = new Map(textFiles.map((file) => [file.path, file.content]));
  const readme = byPath.get("README.md") ?? "";
  for (const section of requiredReadmeSections) {
    if (!readme.includes(section)) {
      issues.push({ code: "missing-required-section", path: "README.md", message: `missing section ${section}` });
    }
  }
  for (const link of requiredReadmeReleaseLinks) {
    if (!readme.includes(link)) {
      issues.push({ code: "missing-required-section", path: "README.md", message: `missing release link ${link}` });
    }
  }
  if (!readme.includes("This repository is a self-hosted application. It is not intended to be")) {
    issues.push({
      code: "missing-required-section",
      path: "README.md",
      message: "missing self-hosted application packaging note",
    });
  }
  const boundaries = byPath.get("docs/PROJECT_BOUNDARIES.md") ?? "";
  for (const phrase of requiredProjectBoundaryPhrases) {
    if (!boundaries.toLowerCase().includes(phrase)) {
      issues.push({
        code: "missing-required-section",
        path: "docs/PROJECT_BOUNDARIES.md",
        message: `missing required boundary phrase: ${phrase}`,
      });
    }
  }
  issues.push(
    ...missingPhrases("CHANGELOG.md", byPath.get("CHANGELOG.md") ?? "", requiredChangelogPhrases),
    ...missingPhrases(
      "docs/RELEASE_NOTES_v0.1.0.md",
      byPath.get("docs/RELEASE_NOTES_v0.1.0.md") ?? "",
      requiredReleaseNotesPhrases,
    ),
    ...missingPhrases(
      "docs/PUBLIC_REPOSITORY_CHECKLIST.md",
      byPath.get("docs/PUBLIC_REPOSITORY_CHECKLIST.md") ?? "",
      requiredPublicRepositoryChecklistPhrases,
    ),
    ...missingPhrases("SECURITY.md", byPath.get("SECURITY.md") ?? "", requiredSecurityPhrases),
    ...missingPhrases("docs/ROADMAP.md", byPath.get("docs/ROADMAP.md") ?? "", requiredRoadmapPhrases),
  );
  const packageJson = byPath.get("package.json") ?? "";
  const packageVersion = readPackageVersion(packageJson);
  if (!packageVersion || !isValidSemver(packageVersion)) {
    issues.push({
      code: "missing-required-section",
      path: "package.json",
      message: "package version must be valid semver",
    });
  }
  if (!/"validate"\s*:\s*"[^"]*pnpm public:safety/.test(packageJson)) {
    issues.push({ code: "missing-required-section", path: "package.json", message: "validate script must include pnpm public:safety" });
  }
  const ciWorkflow = byPath.get(".github/workflows/ci.yml") ?? "";
  if (!ciWorkflow.includes("Public safety check")) {
    issues.push({
      code: "missing-required-section",
      path: ".github/workflows/ci.yml",
      message: "CI Quality job must include public safety check step",
    });
  }
  if (!ciWorkflow.includes("pnpm public:safety")) {
    issues.push({
      code: "missing-required-section",
      path: ".github/workflows/ci.yml",
      message: "CI Quality job must run pnpm public:safety",
    });
  }
  const prTemplate = byPath.get(".github/pull_request_template.md") ?? "";
  for (const checklist of requiredPullRequestChecklist) {
    if (!prTemplate.includes(checklist)) {
      issues.push({
        code: "missing-required-section",
        path: ".github/pull_request_template.md",
        message: `missing PR checklist item: ${checklist}`,
      });
    }
  }
  return issues;
}

function missingPhrases(
  path: string,
  content: string,
  phrases: readonly string[],
): PublicSafetyIssue[] {
  return phrases
    .filter((phrase) => !content.includes(phrase))
    .map((phrase) => ({
      code: "missing-required-section" as const,
      path,
      message: `missing required release phrase: ${phrase}`,
    }));
}

function readPackageVersion(packageJson: string): string | null {
  try {
    const parsed = JSON.parse(packageJson) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

function isValidSemver(version: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version);
}

export function checkProhibitedCopy(textFiles: PublicSafetyTextFile[]): PublicSafetyIssue[] {
  return textFiles
    .filter((file) => isPublicCopyPath(file.path))
    .filter((file) => prohibitedCopyPattern.test(file.content))
    .map((file) => ({
      code: "prohibited-copy" as const,
      path: file.path,
      message: "prohibited public copy phrase found",
    }));
}

export function isLikelyTextPath(file: string): boolean {
  return /\.(?:md|mdx|ts|tsx|js|jsx|json|yml|yaml|css|sql|txt|example)$/.test(file) || !path.extname(file);
}

function isPublicCopyPath(file: string): boolean {
  if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) {
    return false;
  }
  if (file === "src/lib/public-safety/check.ts") {
    return false;
  }
  return (
    file === "README.md" ||
    file.startsWith("docs/") ||
    file.startsWith("src/app/") ||
    file.startsWith("src/components/") ||
    file.startsWith("src/features/") ||
    file.startsWith(".github/")
  );
}

function normalizeMarkdownTarget(raw: string): string {
  return raw.trim().replace(/^<|>$/g, "").split("#")[0].split("?")[0];
}

function isExternalOrAnchor(target: string): boolean {
  return !target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target);
}

function resolveLocalMarkdownTarget(sourcePath: string, target: string): string {
  if (target.startsWith("/")) {
    return target.slice(1);
  }
  const baseDir = path.posix.dirname(sourcePath);
  return path.posix.normalize(path.posix.join(baseDir, target));
}
