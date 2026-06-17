import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadDemoCatalogFixtures } from "@/lib/demo/fixtures";
import { isLikelyTextPath, runPublicSafetyCheck, type PublicSafetyTextFile } from "@/lib/public-safety/check";

async function main() {
  const trackedFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const tracked = new Set(trackedFiles);
  const textFiles: PublicSafetyTextFile[] = [];
  for (const file of trackedFiles) {
    if (!isLikelyTextPath(file)) {
      continue;
    }
    textFiles.push({ path: file, content: fs.readFileSync(file, "utf8") });
  }
  const demoFixtures = await loadDemoCatalogFixtures();
  const issues = runPublicSafetyCheck({
    trackedFiles,
    textFiles,
    demoFixtures,
    exists: (repoRelativePath) => tracked.has(repoRelativePath) || fs.existsSync(path.join(process.cwd(), repoRelativePath)),
  });

  if (issues.length > 0) {
    console.error(JSON.stringify({ ok: false, issues }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ ok: true, checkedFiles: trackedFiles.length, demoFixtures: demoFixtures.length }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
