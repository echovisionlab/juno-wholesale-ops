import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium, type Page } from "playwright";

const storybookDir = join(process.cwd(), "storybook-static");

async function main() {
  await assertStorybookBuilt();
  const server = await startStaticServer(storybookDir);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Storybook smoke server did not expose a local port");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    await smokeDashboardDefaultStory(page, baseUrl);
    await smokeDashboardSavedViewStory(page, baseUrl);
    console.log(JSON.stringify({ ok: true, stories: ["CatalogOpsDashboard/Default", "CatalogOpsDashboard/EmptySignalsWithSavedViews"] }));
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

async function smokeDashboardDefaultStory(page: Page, baseUrl: string) {
  await openStory(page, baseUrl, "feature-dashboard-catalogopsdashboard--default");
  await expectText(page, "Signal Filters");
  await expectText(page, "[Operator digest] 2026-06-17");

  await page.getByLabel("Watch hits").click();
  await expectText(page, "[Watch hit] Lara Voss - Signal Path");
  await expectText(page, "No movement signals match filters");
  await expectMissingText(page, "[Operator digest] 2026-06-17");

  await page.getByRole("button", { name: "Panels" }).click();
  await page.getByLabel("Today signals").click();
  await expectText(page, "Panels (1 hidden)");
  await expectMissingText(page, "Today Signals");
  await page.getByRole("button", { name: "Show all" }).click();
  await expectText(page, "Today Signals");
}

async function smokeDashboardSavedViewStory(page: Page, baseUrl: string) {
  await openStory(page, baseUrl, "feature-dashboard-catalogopsdashboard--empty-signals-with-saved-views");
  await expectText(page, "Signal Filters");
  await page.getByRole("combobox", { name: "Saved view" }).click();
  await expectText(page, "Low stock review");
  await expectText(page, "No observed signals today");
}

async function openStory(page: Page, baseUrl: string, storyId: string) {
  await page.goto(`${baseUrl}/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: "networkidle" });
}

async function expectText(page: Page, text: string) {
  await page.waitForFunction(
    (expected) => {
      return [...document.body.querySelectorAll("*")].some((element) => {
        const style = window.getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return (
          element.textContent?.trim() === expected &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          box.width > 0 &&
          box.height > 0
        );
      });
    },
    text,
    { timeout: 5000 },
  );
}

async function expectMissingText(page: Page, text: string) {
  const matchingNodes = await page.getByText(text, { exact: true }).count();
  if (matchingNodes > 0) {
    throw new Error(`Unexpected text remained visible: ${text}`);
  }
}

async function assertStorybookBuilt() {
  try {
    await stat(join(storybookDir, "iframe.html"));
  } catch {
    throw new Error("Run pnpm build-storybook before pnpm dashboard:storybook-smoke");
  }
}

async function startStaticServer(rootDir: string): Promise<Server> {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const filePath = safeStaticPath(rootDir, url.pathname);
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": contentType(filePath) });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

function safeStaticPath(rootDir: string, pathname: string) {
  const requestPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.replace(/^\/+/, ""));
  const normalizedPath = normalize(requestPath);
  if (normalizedPath.startsWith("..")) {
    throw new Error("Invalid static path");
  }
  return join(rootDir, normalizedPath);
}

function contentType(filePath: string) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  if ([".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico"].includes(extname(filePath))) {
    return "application/octet-stream";
  }
  return "application/octet-stream";
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
