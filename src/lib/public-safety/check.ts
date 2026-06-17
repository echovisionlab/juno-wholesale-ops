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
  ...demoFixtureRelativePaths,
] as const;

const requiredReadmeSections = [
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
] as const;

const requiredProjectBoundaryPhrases = [
  "read-only catalog intelligence",
  "does not call cart, wishlist, checkout, or ordering endpoints",
  "observed stock or status changes are not evidence of actual sales volume",
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
