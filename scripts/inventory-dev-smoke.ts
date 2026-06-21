type CheckResult = {
  label: string;
  url: string;
  method: "GET" | "HEAD";
  ok: boolean;
  status?: number;
  body?: unknown;
  error?: string;
};

const defaultInventoryDevUrl = "https://inventory-dev.dsub.io";
const localDevUrl = "http://127.0.0.1:3006";

async function main() {
  const args = process.argv.slice(2);
  const localOnly = args.includes("--local-only");
  const targetUrl = normalizeBaseUrl(args.find((arg) => !arg.startsWith("--")) ?? defaultInventoryDevUrl);

  const localHealth = await checkJson("local health", `${localDevUrl}/api/health`);
  if (!localHealth.ok) {
    console.error(
      "Next dev server is not reachable at http://127.0.0.1:3006. Start `pnpm dev` before using inventory-dev tunnel.",
    );
    console.log(JSON.stringify({ local: localHealth }, null, 2));
    process.exitCode = 1;
    return;
  }

  if (localOnly) {
    console.log(JSON.stringify({ local: localHealth }, null, 2));
    return;
  }

  const publicChecks = [
    await checkJson("inventory-dev health", `${targetUrl}/api/health`),
    await checkJson("inventory-dev version", `${targetUrl}/api/version`),
    await checkHead("inventory-dev root", `${targetUrl}/`),
    await checkHead("inventory-dev login", `${targetUrl}/login`),
    await checkHead("inventory-dev settings", `${targetUrl}/settings`),
  ];

  const summary = {
    local: localHealth,
    public: publicChecks,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (publicChecks.some((check) => !check.ok)) {
    console.error("inventory-dev smoke failed. If local health is ok, check the Cloudflare tunnel and origin routing.");
    process.exitCode = 1;
  }
}

async function checkJson(label: string, url: string): Promise<CheckResult> {
  try {
    const response = await fetch(url, { method: "GET", redirect: "manual" });
    const body = await readBody(response);
    return {
      label,
      url,
      method: "GET",
      ok: response.ok && isOkStatusBody(body),
      status: response.status,
      body,
    };
  } catch (error) {
    return {
      label,
      url,
      method: "GET",
      ok: false,
      error: formatError(error),
    };
  }
}

async function checkHead(label: string, url: string): Promise<CheckResult> {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "manual" });
    return {
      label,
      url,
      method: "HEAD",
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
    };
  } catch (error) {
    return {
      label,
      url,
      method: "HEAD",
      ok: false,
      error: formatError(error),
    };
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 120);
  }
}

function isOkStatusBody(body: unknown): boolean {
  if (!body || typeof body !== "object") {
    return false;
  }
  return "status" in body && body.status === "ok";
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error: unknown) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
