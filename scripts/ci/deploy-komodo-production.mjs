#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const DEFAULT_STACK_NAME = "juno-wholesale-ops-app-stack";
const DEFAULT_RUN_DIRECTORY = "/srv/juno-wholesale-ops";
const DEFAULT_PROJECT_NAME = "juno-wholesale-ops";
const DEFAULT_FILE_PATHS = ["compose/app.yml"];
const DEFAULT_WAIT_SERVICES = ["web-prod"];
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_POLL_MS = 5 * 1000;
const DEFAULT_SMOKE_TIMEOUT_MS = 15 * 1000;
const DEFAULT_SMOKE_ATTEMPTS = 12;
const DEFAULT_SMOKE_RETRY_DELAY_MS = 5 * 1000;
const DEFAULT_UPDATE_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_UPDATE_POLL_MS = 1 * 1000;
const DEFAULT_REGISTRY = "harbor.dsub.io";
const DEFAULT_REGISTRY_PROJECT = "dsub";
const DEFAULT_IMAGE_NAME = "juno-wholesale-ops-web";
const IMAGE_ENV_KEY = "JUNO_WHOLESALE_OPS_WEB_IMAGE";
const DATABASE_ENV_KEY = "DATABASE_URL";
const SYNC_FILES = [
  {
    source: "compose/app.yml",
    target: "compose/app.yml",
  },
];

function fail(message) {
  throw new Error(message);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    fail(`${name} is required`);
  }
  return value;
}

function parseList(value, fallback) {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBoolean(value, fallback) {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function parsePositiveIntegerEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    fail(`${name} must be a positive integer`);
  }
  return parsed;
}

function requireSmokeUrls(urls) {
  const required = parseBoolean(process.env.KOMODO_REQUIRE_SMOKE_URLS, false);
  if (required && urls.length === 0) {
    fail("KOMODO_REQUIRE_SMOKE_URLS is enabled, but KOMODO_SMOKE_URLS is empty");
  }
}

function isReleaseTag(tag) {
  return /^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z]+)*$/.test(tag);
}

function validateReleaseTag(tag) {
  if (!isReleaseTag(tag)) {
    fail(`Unsupported deploy image tag: ${tag}`);
  }
}

function releaseImageRef(tag) {
  validateReleaseTag(tag);
  const registry = process.env.REGISTRY ?? DEFAULT_REGISTRY;
  const project = process.env.REGISTRY_PROJECT ?? DEFAULT_REGISTRY_PROJECT;
  const imageName = process.env.IMAGE_NAME ?? DEFAULT_IMAGE_NAME;
  return `${registry}/${project}/${imageName}:${tag}`;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  const sanitized = text.replace(/[\u0000-\u0019]+/g, "");
  return JSON.parse(sanitized);
}

class KomodoClient {
  constructor({ baseUrl, token, apiKey, apiSecret }) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  static async createFromEnv() {
    const baseUrl = requiredEnv("KOMODO_URL");
    const configuredToken = process.env.KOMODO_TOKEN;
    if (configuredToken) {
      return new KomodoClient({ baseUrl, token: configuredToken });
    }

    const apiKey = process.env.KOMODO_API_KEY;
    const apiSecret = process.env.KOMODO_API_SECRET ?? process.env.KOMODO_API_KEY_SECRET;
    if (apiKey && apiSecret) {
      return new KomodoClient({ baseUrl, apiKey, apiSecret });
    }

    const username = process.env.KOMODO_USERNAME;
    const password = process.env.KOMODO_PASSWORD;
    if (!username || !password) {
      fail("Set KOMODO_TOKEN, KOMODO_API_KEY/KOMODO_API_SECRET, or KOMODO_USERNAME/KOMODO_PASSWORD");
    }

    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/auth/LoginLocalUser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      fail(`Komodo login failed (${response.status})`);
    }

    const payload = await parseJsonResponse(response);
    if (!payload?.jwt) {
      fail("Komodo login did not return a token");
    }

    return new KomodoClient({ baseUrl, token: payload.jwt });
  }

  headers() {
    const headers = { "Content-Type": "application/json" };
    if (this.token) {
      headers.Authorization = this.token;
      return headers;
    }
    headers["X-Api-Key"] = this.apiKey;
    headers["X-Api-Secret"] = this.apiSecret;
    return headers;
  }

  async request(endpoint, { type, params }) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ type, params }),
    });

    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      const reason =
        payload && typeof payload === "object" && typeof payload.error === "string" ? `: ${payload.error}` : "";
      fail(`Komodo ${type} failed (${response.status})${reason}`);
    }

    if (payload && typeof payload === "object" && payload.success === false) {
      fail(`Komodo ${type} returned success=false`);
    }

    return payload;
  }

  listStacks() {
    return this.request("/read", { type: "ListStacks", params: {} });
  }

  getStack(stackId) {
    return this.request("/read", { type: "GetStack", params: { stack: stackId } });
  }

  getUpdate(updateId) {
    return this.request("/read", { type: "GetUpdate", params: { id: updateId } });
  }

  listStackServices(stackId) {
    return this.request("/read", { type: "ListStackServices", params: { stack: stackId } });
  }

  updateStackEnvironment(stackId, environment) {
    return this.request("/write", {
      type: "UpdateStack",
      params: {
        id: stackId,
        config: { environment },
      },
    });
  }

  updateStackConfig(stackId, config) {
    return this.request("/write", {
      type: "UpdateStack",
      params: {
        id: stackId,
        config,
      },
    });
  }

  writeStackFileContents(stackId, filePath, contents) {
    return this.request("/write", {
      type: "WriteStackFileContents",
      params: { stack: stackId, file_path: filePath, contents },
    });
  }

  deployStack(stackId) {
    return this.request("/execute", {
      type: "DeployStack",
      params: { stack: stackId },
    });
  }
}

function extractPayloadArray(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.response)) {
    return payload.response;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  return [];
}

async function findStackId(client, stackName) {
  const stacks = extractPayloadArray(await client.listStacks());
  const stack = stacks.find((entry) => entry.name === stackName);
  if (!stack) {
    fail(`failed to resolve Komodo stack: ${stackName}`);
  }
  return stack.id;
}

function parseEnvironmentBlock(environment) {
  const map = new Map();
  for (const line of String(environment ?? "").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      map.set(match[1], match[2]);
    }
  }
  return map;
}

function mergeEnvironment(environment, values, removeKeys = []) {
  const lines = String(environment ?? "").split(/\r?\n/);
  const remaining = new Map(Object.entries(values));
  const remove = new Set(removeKeys);
  const next = [];

  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match) {
      if (line.trim()) {
        next.push(line);
      }
      continue;
    }

    const key = match[1];
    if (remove.has(key)) {
      continue;
    }
    if (!remaining.has(key)) {
      next.push(line);
      continue;
    }

    next.push(`${key}=${remaining.get(key)}`);
    remaining.delete(key);
  }

  for (const [key, value] of remaining) {
    next.push(`${key}=${value}`);
  }

  return `${next.join("\n")}\n`;
}

function validateRuntimeEnvironment(environment) {
  const values = parseEnvironmentBlock(environment);
  if (!values.get(DATABASE_ENV_KEY)) {
    fail(`Komodo stack environment must set ${DATABASE_ENV_KEY} before production deploy`);
  }

}

function serviceState(entry) {
  return entry?.container?.state ?? entry?.container?.status ?? entry?.state ?? "";
}

function serviceStatus(entry) {
  return entry?.container?.status ?? entry?.status ?? "";
}

function serviceLabels(entry) {
  const container = entry?.container ?? {};
  return entry?.labels ?? container.labels ?? container.config?.Labels ?? container.inspect?.Config?.Labels ?? {};
}

function objectValue(object, key) {
  if (!object || typeof object !== "object") {
    return "";
  }
  const value = object[key];
  return typeof value === "string" ? value : "";
}

function candidateValues(...values) {
  return values.flatMap((value) => (Array.isArray(value) ? value : [value]));
}

function usableImageRef(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("sha256:") &&
    value.includes("/") &&
    (value.includes(":") || value.includes("@sha256:"))
  );
}

function serviceImageRef(entry) {
  const container = entry?.container ?? {};
  const labels = serviceLabels(entry);
  const versionLabel = objectValue(labels, "org.opencontainers.image.version");
  if (isReleaseTag(versionLabel)) {
    return releaseImageRef(versionLabel);
  }

  const candidates = candidateValues(
    entry?.image,
    entry?.image_name,
    container.image,
    container.image_name,
    container.config?.image,
    container.config?.Image,
    container.inspect?.Config?.Image,
    entry?.repo_digest,
    entry?.repo_digests,
    container.repo_digest,
    container.repo_digests,
    container.inspect?.RepoDigests,
  );

  return candidates.find(usableImageRef) ?? "";
}

function updateId(update) {
  const id = update?._id;
  if (typeof id === "string") {
    return id;
  }
  if (typeof id?.$oid === "string") {
    return id.$oid;
  }
  return "";
}

async function waitForUpdate(client, update, label) {
  const id = updateId(update);
  if (!id) {
    return update;
  }

  const timeoutMs = parsePositiveIntegerEnv("KOMODO_UPDATE_TIMEOUT_MS", DEFAULT_UPDATE_TIMEOUT_MS);
  const pollMs = parsePositiveIntegerEnv("KOMODO_UPDATE_POLL_MS", DEFAULT_UPDATE_POLL_MS);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const current = await client.getUpdate(id);
    if (current?.status === "Complete") {
      if (current.success === false) {
        fail(`Komodo update failed: ${label}`);
      }
      return current;
    }
    await delay(pollMs);
  }

  fail(`Timed out waiting for Komodo update: ${label}`);
}

function serviceReady(entry, requireHealthy) {
  if (!entry) {
    return false;
  }
  const state = serviceState(entry);
  const status = serviceStatus(entry);
  if (state !== "running") {
    return false;
  }
  return !requireHealthy || status.includes("(healthy)");
}

async function waitForServices(client, stackId, serviceNames) {
  const timeoutMs = parsePositiveIntegerEnv("KOMODO_WAIT_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const pollMs = parsePositiveIntegerEnv("KOMODO_WAIT_POLL_MS", DEFAULT_POLL_MS);
  const requireHealthy = parseBoolean(process.env.KOMODO_REQUIRE_HEALTHY, true);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const services = extractPayloadArray(await client.listStackServices(stackId));
    const failures = [];

    for (const serviceName of serviceNames) {
      const service = services.find((entry) => entry.service === serviceName);
      if (!serviceReady(service, requireHealthy)) {
        failures.push(`${serviceName}:${serviceState(service) || "missing"} ${serviceStatus(service)}`.trim());
      }
    }

    if (failures.length === 0) {
      console.log(`Services ready: ${serviceNames.join(", ")}`);
      return;
    }

    console.log(`Waiting for services: ${failures.join(", ")}`);
    await delay(pollMs);
  }

  fail(`Timed out waiting for services: ${serviceNames.join(", ")}`);
}

function describeError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const details = [error.message];
  const cause = error.cause;
  if (cause instanceof Error) {
    details.push(`cause=${cause.message}`);
  } else if (cause && typeof cause === "object") {
    const causeDetails = ["code", "errno", "syscall", "address", "port"]
      .map((key) => {
        const value = cause[key];
        return value === undefined ? null : `${key}=${value}`;
      })
      .filter(Boolean);
    if (causeDetails.length > 0) {
      details.push(`cause=${causeDetails.join(" ")}`);
    }
  } else if (cause !== undefined) {
    details.push(`cause=${String(cause)}`);
  }

  return details.join("; ");
}

function checkSmokeUrl(url, timeoutMs, verifyTls) {
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  const args = ["--fail", "--silent", "--show-error", "--location", "--max-time", String(timeoutSeconds)];
  if (!verifyTls) {
    args.push("--insecure");
  }
  args.push(url);

  return new Promise((resolve, reject) => {
    const child = spawn("curl", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = stderr.trim();
      reject(new Error(`curl exited ${code}${reason ? `: ${reason}` : ""}`));
    });
  });
}

async function checkSmokeUrls(urls, label) {
  const attempts = parsePositiveIntegerEnv("KOMODO_SMOKE_ATTEMPTS", DEFAULT_SMOKE_ATTEMPTS);
  const retryDelayMs = parsePositiveIntegerEnv("KOMODO_SMOKE_RETRY_DELAY_MS", DEFAULT_SMOKE_RETRY_DELAY_MS);
  const timeoutMs = parsePositiveIntegerEnv("KOMODO_SMOKE_TIMEOUT_MS", DEFAULT_SMOKE_TIMEOUT_MS);
  const verifyTls = parseBoolean(process.env.KOMODO_SMOKE_TLS_VERIFY, true);

  for (const url of urls) {
    let lastFailure = "";
    let passed = false;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        console.log(`Smoke ${label} (${attempt}/${attempts}): ${url}`);
        await checkSmokeUrl(url, timeoutMs, verifyTls);
        passed = true;
        break;
      } catch (error) {
        lastFailure = describeError(error);
      }

      if (attempt < attempts) {
        console.log(`Smoke ${url} failed: ${lastFailure}; retrying`);
        await delay(retryDelayMs);
      }
    }

    if (!passed) {
      fail(`Smoke ${url} failed after ${attempts} attempts: ${lastFailure}`);
    }
  }
}

async function syncStackFiles(client, stackId) {
  for (const entry of SYNC_FILES) {
    const contents = await readFile(path.join(REPO_ROOT, entry.source), "utf8");
    console.log(`Sync ${entry.source} -> ${entry.target}`);
    const update = await client.writeStackFileContents(stackId, entry.target, contents);
    await waitForUpdate(client, update, `write ${entry.target}`);
  }
}

async function syncStackConfig(client, stackId) {
  console.log("Sync Komodo stack non-secret config");
  await client.updateStackConfig(stackId, {
    run_directory: process.env.KOMODO_RUN_DIRECTORY || DEFAULT_RUN_DIRECTORY,
    project_name: process.env.KOMODO_PROJECT_NAME || DEFAULT_PROJECT_NAME,
    file_paths: parseList(process.env.KOMODO_FILE_PATHS, DEFAULT_FILE_PATHS),
  });
}

async function captureCurrentImageRef(client, stackId, serviceName) {
  const services = extractPayloadArray(await client.listStackServices(stackId));
  const service = services.find((entry) => entry.service === serviceName);
  const imageRef = serviceImageRef(service);
  if (imageRef) {
    console.log(`Captured rollback image for ${serviceName}`);
  } else {
    console.log(`Rollback image unavailable for ${serviceName}`);
  }
  return imageRef;
}

async function applyImageEnvironment(client, stackId, imageRef, currentEnvironment) {
  const currentValues = parseEnvironmentBlock(currentEnvironment);
  const previousImageRef = currentValues.get(IMAGE_ENV_KEY) ?? "";
  const nextEnvironment = mergeEnvironment(currentEnvironment, { [IMAGE_ENV_KEY]: imageRef });

  if (nextEnvironment !== currentEnvironment) {
    console.log(`Update Komodo stack environment: ${IMAGE_ENV_KEY}`);
    await client.updateStackEnvironment(stackId, nextEnvironment);
  }

  return previousImageRef;
}

async function deployAndWait(client, stackId, stackName, serviceNames, smokeUrls, label) {
  console.log(`Deploy ${stackName} (${label})`);
  const update = await client.deployStack(stackId);
  await waitForUpdate(client, update, `deploy ${stackName}`);
  await waitForServices(client, stackId, serviceNames);
  await checkSmokeUrls(smokeUrls, label);
}

async function assertServiceImage(client, stackId, serviceName, expectedImageRef) {
  const services = extractPayloadArray(await client.listStackServices(stackId));
  const service = services.find((entry) => entry.service === serviceName);
  const imageRef = serviceImageRef(service);
  if (imageRef !== expectedImageRef) {
    fail(`${serviceName} is not running expected image tag`);
  }
}

async function rollback(client, stackId, stackName, serviceNames, smokeUrls, previousImageRef) {
  if (!previousImageRef) {
    fail("Deploy failed and rollback image was unavailable");
  }

  const stack = await client.getStack(stackId);
  const currentEnvironment = stack?.config?.environment ?? "";
  const rollbackEnvironment = mergeEnvironment(currentEnvironment, { [IMAGE_ENV_KEY]: previousImageRef });
  console.log(`Rollback Komodo stack environment: ${IMAGE_ENV_KEY}`);
  await client.updateStackEnvironment(stackId, rollbackEnvironment);
  await deployAndWait(client, stackId, stackName, serviceNames, smokeUrls, "rollback");
}

async function main() {
  const deployImageTag = requiredEnv("DEPLOY_IMAGE_TAG");
  const imageRef = releaseImageRef(deployImageTag);
  const stackName = process.env.KOMODO_STACK_NAME || DEFAULT_STACK_NAME;
  const waitServiceNames = parseList(process.env.KOMODO_WAIT_SERVICES, DEFAULT_WAIT_SERVICES);
  const smokeUrls = parseList(process.env.KOMODO_SMOKE_URLS, []);
  requireSmokeUrls(smokeUrls);
  const rollbackEnabled = parseBoolean(process.env.KOMODO_ROLLBACK_ON_FAILURE, true);

  const client = await KomodoClient.createFromEnv();
  const stackId = await findStackId(client, stackName);
  const stack = await client.getStack(stackId);
  const currentEnvironment = stack?.config?.environment ?? "";
  validateRuntimeEnvironment(currentEnvironment);
  const rollbackImageRef = rollbackEnabled ? await captureCurrentImageRef(client, stackId, "web-prod") : "";
  await syncStackConfig(client, stackId);
  await syncStackFiles(client, stackId);
  const previousImageRef = await applyImageEnvironment(client, stackId, imageRef, currentEnvironment);

  try {
    await deployAndWait(client, stackId, stackName, waitServiceNames, smokeUrls, deployImageTag);
    await assertServiceImage(client, stackId, "web-prod", imageRef);
  } catch (error) {
    const deployError = error instanceof Error ? error : new Error(String(error));
    console.error(`Deploy failed for ${deployImageTag}: ${deployError.message}`);

    if (!rollbackEnabled) {
      throw deployError;
    }

    await rollback(client, stackId, stackName, waitServiceNames, smokeUrls, rollbackImageRef || previousImageRef);
    fail(`Deploy failed for ${deployImageTag}; rollback completed. Original failure: ${deployError.message}`);
  }

  console.log(`Deploy succeeded for ${deployImageTag}: ${imageRef}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
