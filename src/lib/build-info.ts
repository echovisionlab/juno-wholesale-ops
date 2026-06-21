import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import packageJson from "../../package.json";

export type PublicVersionInfo = {
  status: "ok";
  version: string;
  gitSha: string | null;
};

export function getPublicVersionInfo(cwd = process.cwd()): PublicVersionInfo {
  return {
    status: "ok",
    version: packageJson.version,
    gitSha: readGitSha(cwd),
  };
}

function readGitSha(cwd: string): string | null {
  const gitDir = resolveGitDir(cwd);
  if (!gitDir) {
    return null;
  }

  try {
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    if (matchesFullGitSha(head)) {
      return head;
    }
    if (!head.startsWith("ref:")) {
      return null;
    }

    const ref = head.slice("ref:".length).trim();
    const commonGitDir = resolveCommonGitDir(gitDir);
    const refSha = readRef(gitDir, ref) ?? readRef(commonGitDir, ref);
    if (refSha) {
      return refSha;
    }

    return readPackedRef(gitDir, ref) ?? readPackedRef(commonGitDir, ref);
  } catch {
    return null;
  }
}

function resolveGitDir(cwd: string): string | null {
  const dotGit = join(cwd, ".git");
  try {
    const stats = statSync(dotGit);
    if (stats.isDirectory()) {
      return dotGit;
    }
    if (!stats.isFile()) {
      return null;
    }
    const content = readFileSync(dotGit, "utf8").trim();
    const match = content.match(/^gitdir:\s*(.+)$/i);
    if (!match?.[1]) {
      return null;
    }
    return isAbsolute(match[1]) ? match[1] : resolve(cwd, match[1]);
  } catch {
    return null;
  }
}

function resolveCommonGitDir(gitDir: string): string {
  try {
    const commonDir = readFileSync(join(gitDir, "commondir"), "utf8").trim();
    if (!commonDir) {
      return gitDir;
    }
    return isAbsolute(commonDir) ? commonDir : resolve(gitDir, commonDir);
  } catch {
    return gitDir;
  }
}

function readRef(gitDir: string, ref: string): string | null {
  const refPath = join(gitDir, ref);
  if (!existsSync(refPath)) {
    return null;
  }
  const value = readFileSync(refPath, "utf8").trim();
  return matchesFullGitSha(value) ? value : null;
}

function readPackedRef(gitDir: string, ref: string): string | null {
  const packedRefsPath = join(gitDir, "packed-refs");
  if (!existsSync(packedRefsPath)) {
    return null;
  }

  for (const line of readFileSync(packedRefsPath, "utf8").split("\n")) {
    if (line.startsWith("#") || !line.trim()) {
      continue;
    }
    const [sha, packedRef] = line.split(" ");
    if (packedRef === ref && sha && matchesFullGitSha(sha)) {
      return sha;
    }
  }

  return null;
}

function matchesFullGitSha(value: string | undefined): boolean {
  return Boolean(value && /^[0-9a-f]{40}$/i.test(value));
}
