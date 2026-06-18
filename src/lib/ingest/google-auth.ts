import crypto from "node:crypto";
import fs from "node:fs/promises";

export type ServiceAccountKey = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export async function loadServiceAccountKey(path: string): Promise<ServiceAccountKey> {
  const raw = await fs.readFile(path, "utf8");
  return parseServiceAccountKeyJson(raw);
}

export function parseServiceAccountKeyJson(raw: string): ServiceAccountKey {
  const parsed = JSON.parse(raw) as Partial<ServiceAccountKey>;

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Invalid service account key JSON");
  }

  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
    token_uri: parsed.token_uri,
  };
}

export async function getDelegatedAccessToken(options: {
  key: ServiceAccountKey;
  subject: string;
  scopes: string[];
}): Promise<string> {
  const tokenUri = options.key.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: options.key.client_email,
    scope: options.scopes.join(" "),
    aud: tokenUri,
    exp: now + 3600,
    iat: now,
    sub: options.subject,
  };

  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(claim),
  )}`;
  const signature = crypto.sign(
    "RSA-SHA256",
    Buffer.from(signingInput),
    options.key.private_key,
  );
  const assertion = `${signingInput}.${base64Url(signature)}`;

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const body = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    throw new Error(
      `Google OAuth token request failed: ${body.error ?? response.status} ${
        body.error_description ?? ""
      }`.trim(),
    );
  }

  return body.access_token;
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
