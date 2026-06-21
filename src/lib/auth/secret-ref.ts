import { readFileSync } from "node:fs";

export type SecretRefResolution = {
  value: string | null;
  source: "unset" | "env" | "file" | "unsupported";
};

export type SecretRefResolverOptions = {
  env?: Record<string, string | undefined>;
  readFile?: (path: string) => string;
};

export function resolveSecretRef(ref: string | null | undefined, options: SecretRefResolverOptions = {}): SecretRefResolution {
  const normalizedRef = ref?.trim();
  if (!normalizedRef) {
    return { value: null, source: "unset" };
  }

  const env = options.env ?? process.env;
  const readFile = options.readFile ?? ((filePath: string) => readFileSync(filePath, "utf8"));
  const parsed = parseSecretRef(normalizedRef);

  if (parsed.kind === "env") {
    return parsed.name ? { value: normalizeSecretValue(env[parsed.name]), source: "env" } : { value: null, source: "env" };
  }

  if (parsed.kind === "file") {
    try {
      return { value: normalizeSecretValue(readFile(parsed.path)), source: "file" };
    } catch {
      return { value: null, source: "file" };
    }
  }

  return { value: null, source: "unsupported" };
}

export function isSupportedSecretRef(ref: string | null | undefined): boolean {
  const normalizedRef = ref?.trim();
  if (!normalizedRef) {
    return false;
  }
  const parsed = parseSecretRef(normalizedRef);
  if (parsed.kind === "env") {
    return Boolean(parsed.name);
  }
  if (parsed.kind === "file") {
    return parsed.path.startsWith("/");
  }
  return false;
}

function parseSecretRef(ref: string): { kind: "env"; name: string } | { kind: "file"; path: string } | { kind: "unsupported" } {
  if (ref.startsWith("env:")) {
    return { kind: "env", name: ref.slice("env:".length).trim() };
  }
  if (ref.startsWith("file:")) {
    return { kind: "file", path: ref.slice("file:".length).trim() };
  }
  return { kind: "unsupported" };
}

function normalizeSecretValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
