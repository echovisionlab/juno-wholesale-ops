import { Pool, type PoolClient } from "pg";
import { isSupportedSecretRef } from "./secret-ref";

export type SsoAdminRuleType = "email_allowlist" | "claim_equals";
export type SsoProviderProtocol = "oidc" | "oauth2";
export type SsoProviderPreset =
  | "custom_oidc"
  | "custom_oauth2"
  | "google_oidc"
  | "microsoft_entra_oidc"
  | "auth0_oidc"
  | "okta_oidc";

export type SsoAdminRule = {
  id: string;
  type: SsoAdminRuleType;
  value: string;
};

export type SsoProviderRecord = {
  id: string;
  providerId: string;
  displayName: string;
  buttonLabel: string;
  logoUrl: string | null;
  protocol: SsoProviderProtocol;
  preset: SsoProviderPreset;
  discoveryUrl: string | null;
  authorizationUrl: string | null;
  tokenUrl: string | null;
  userInfoUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  clientSecretRef: string | null;
  clientSecretConfigured: boolean;
  scopes: string[];
  enabled: boolean;
  sortOrder: number;
  adminRules: SsoAdminRule[];
  createdAt: string;
  updatedAt: string;
};

export type PublicSsoProvider = Omit<SsoProviderRecord, "clientSecret"> & {
  clientSecret?: never;
  status: "ready" | "missing" | "invalid" | "disabled";
  missing: string[];
  invalid: string[];
  callbackUrl: string | null;
};

export type SsoProviderInput = {
  providerId: string;
  displayName: string;
  protocol?: SsoProviderProtocol | string | null;
  preset?: SsoProviderPreset | string | null;
  buttonLabel?: string | null;
  logoUrl?: string | null;
  discoveryUrl?: string | null;
  authorizationUrl?: string | null;
  tokenUrl?: string | null;
  userInfoUrl?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  clientSecretRef?: string | null;
  scopes?: string[] | string | null;
  enabled?: boolean;
  sortOrder?: number;
  adminEmailAllowlist?: string[] | string | null;
  adminClaim?: string | null;
  adminClaimValue?: string | null;
};

export type SsoProviderPatch = Partial<SsoProviderInput> & {
  id: string;
};

export async function listSsoProviders(databaseUrl: string): Promise<SsoProviderRecord[]> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    return await listSsoProvidersClient(pool);
  } finally {
    await pool.end();
  }
}

export async function createSsoProvider(databaseUrl: string, input: SsoProviderInput): Promise<SsoProviderRecord> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const provider = await createSsoProviderClient(client, input);
    await client.query("COMMIT");
    return provider;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function updateSsoProvider(databaseUrl: string, patch: SsoProviderPatch): Promise<SsoProviderRecord> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const provider = await updateSsoProviderClient(client, patch);
    await client.query("COMMIT");
    return provider;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function deleteSsoProvider(databaseUrl: string, id: string): Promise<{ deleted: boolean }> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query("DELETE FROM auth_sso_provider WHERE id = $1", [id]);
    return { deleted: (result.rowCount ?? 0) > 0 };
  } finally {
    await pool.end();
  }
}

export function redactSsoProvider(
  provider: SsoProviderRecord,
  baseUrl: string | null,
  options: { clientSecretAvailable?: boolean } = {},
): PublicSsoProvider {
  const clientSecretAvailable = options.clientSecretAvailable ?? Boolean(provider.clientSecret);
  const validation = validateSsoProviderReadiness(
    { ...provider, clientSecretAvailable },
    baseUrl,
  );
  const { clientSecret, ...publicProvider } = provider;
  void clientSecret;
  return {
    ...publicProvider,
    clientSecretConfigured: provider.clientSecretConfigured,
    status: validation.status,
    missing: validation.missing,
    invalid: validation.invalid,
    callbackUrl: baseUrl ? `${baseUrl.replace(/\/+$/, "")}/api/auth/oauth2/callback/${provider.providerId}` : null,
  };
}

export function validateSsoProviderInput(input: SsoProviderInput | SsoProviderPatch, options: { requireSecret: boolean }): string[] {
  const issues: string[] = [];
  if (options.requireSecret && !("providerId" in input && input.providerId?.trim())) {
    issues.push("providerId is required");
  }
  if ("providerId" in input && input.providerId !== undefined && !isProviderId(input.providerId)) {
    issues.push("providerId must start with a lowercase letter or digit and contain only lowercase letters, digits, underscores, or dashes");
  }
  if ("protocol" in input && input.protocol !== undefined && !isProviderProtocol(input.protocol)) {
    issues.push("protocol must be oidc or oauth2");
  }
  if ("preset" in input && input.preset !== undefined && !isProviderPreset(input.preset)) {
    issues.push("preset is not supported");
  }
  if (
    "protocol" in input &&
    "preset" in input &&
    isProviderProtocol(input.protocol) &&
    isProviderPreset(input.preset) &&
    presetProtocol(input.preset) !== input.protocol
  ) {
    issues.push("preset must match protocol");
  }
  if (options.requireSecret && !("displayName" in input && input.displayName?.trim())) {
    issues.push("displayName is required");
  } else if ("displayName" in input && input.displayName !== undefined && !input.displayName.trim()) {
    issues.push("displayName is required");
  }
  if ("logoUrl" in input && input.logoUrl && !isUrl(input.logoUrl)) {
    issues.push("logoUrl must be a valid URL");
  }
  if ("discoveryUrl" in input && input.discoveryUrl && !isUrl(input.discoveryUrl)) {
    issues.push("discoveryUrl must be a valid URL");
  }
  if ("authorizationUrl" in input && input.authorizationUrl && !isUrl(input.authorizationUrl)) {
    issues.push("authorizationUrl must be a valid URL");
  }
  if ("tokenUrl" in input && input.tokenUrl && !isUrl(input.tokenUrl)) {
    issues.push("tokenUrl must be a valid URL");
  }
  if ("userInfoUrl" in input && input.userInfoUrl && !isUrl(input.userInfoUrl)) {
    issues.push("userInfoUrl must be a valid URL");
  }
  if ("clientSecret" in input && input.clientSecret !== undefined && normalizeOptionalString(input.clientSecret)) {
    issues.push("clientSecret is not accepted; use clientSecretRef");
  }
  if ("clientSecretRef" in input && input.clientSecretRef !== undefined) {
    const clientSecretRef = normalizeOptionalString(input.clientSecretRef);
    if (clientSecretRef && !isSupportedSecretRef(clientSecretRef)) {
      issues.push("clientSecretRef must use env:NAME or file:/absolute/path");
    }
  }
  if (options.requireSecret && !("clientSecretRef" in input && input.clientSecretRef?.trim())) {
    issues.push("clientSecretRef is required when creating a provider");
  }
  if ("adminClaim" in input || "adminClaimValue" in input) {
    const adminClaim = normalizeOptionalString(input.adminClaim);
    const adminClaimValue = normalizeOptionalString(input.adminClaimValue);
    if (Boolean(adminClaim) !== Boolean(adminClaimValue)) {
      issues.push("adminClaim and adminClaimValue must be configured together");
    }
  }
  return issues;
}

export function validateSsoProviderReadiness(
  provider: Pick<SsoProviderRecord, "enabled" | "providerId" | "displayName" | "protocol" | "discoveryUrl" | "authorizationUrl" | "tokenUrl" | "userInfoUrl" | "clientId" | "clientSecretConfigured"> & {
    clientSecretAvailable?: boolean;
  },
  baseUrl: string | null,
): { status: PublicSsoProvider["status"]; missing: string[]; invalid: string[] } {
  if (!provider.enabled) {
    return { status: "disabled", missing: [], invalid: [] };
  }
  const endpointMissing = provider.protocol === "oauth2" && !provider.discoveryUrl
    ? [
        provider.authorizationUrl ? null : "authorization URL",
        provider.tokenUrl ? null : "token URL",
        provider.userInfoUrl ? null : "user info URL",
      ]
    : [provider.discoveryUrl ? null : "discovery URL"];
  const clientSecretReady = provider.clientSecretAvailable ?? provider.clientSecretConfigured;
  const missing = [
    provider.providerId ? null : "provider id",
    provider.displayName ? null : "display name",
    ...endpointMissing,
    provider.clientId ? null : "client ID",
    clientSecretReady ? null : "client secret",
    baseUrl ? null : "site address",
  ].filter((value): value is string => Boolean(value));
  const invalid = [
    provider.providerId && !isProviderId(provider.providerId) ? "provider id" : null,
    provider.discoveryUrl && !isUrl(provider.discoveryUrl) ? "discovery URL" : null,
    provider.authorizationUrl && !isUrl(provider.authorizationUrl) ? "authorization URL" : null,
    provider.tokenUrl && !isUrl(provider.tokenUrl) ? "token URL" : null,
    provider.userInfoUrl && !isUrl(provider.userInfoUrl) ? "user info URL" : null,
    baseUrl && !isUrl(baseUrl) ? "site address" : null,
  ].filter((value): value is string => Boolean(value));
  return {
    status: missing.length > 0 ? "missing" : invalid.length > 0 ? "invalid" : "ready",
    missing,
    invalid,
  };
}

async function listSsoProvidersClient(queryable: Pool | PoolClient): Promise<SsoProviderRecord[]> {
  const result = await queryable.query<ProviderRow & { rules: RuleRow[] | null }>(
    `
      SELECT
        auth_sso_provider.id,
        auth_sso_provider.provider_id,
        auth_sso_provider.display_name,
        auth_sso_provider.button_label,
        auth_sso_provider.logo_url,
        auth_sso_provider.protocol,
        auth_sso_provider.preset,
        auth_sso_provider.discovery_url,
        auth_sso_provider.authorization_url,
        auth_sso_provider.token_url,
        auth_sso_provider.user_info_url,
        auth_sso_provider.client_id,
        auth_sso_provider.client_secret,
        auth_sso_provider.client_secret_ref,
        auth_sso_provider.scopes,
        auth_sso_provider.enabled,
        auth_sso_provider.sort_order,
        auth_sso_provider.created_at::text,
        auth_sso_provider.updated_at::text,
        COALESCE(
          json_agg(
            json_build_object(
              'id', auth_sso_admin_rule.id,
              'type', auth_sso_admin_rule.rule_type,
              'value', auth_sso_admin_rule.rule_value
            )
            ORDER BY auth_sso_admin_rule.created_at
          ) FILTER (WHERE auth_sso_admin_rule.id IS NOT NULL),
          '[]'::json
        ) AS rules
      FROM auth_sso_provider
      LEFT JOIN auth_sso_admin_rule ON auth_sso_admin_rule.provider_id = auth_sso_provider.id
      GROUP BY auth_sso_provider.id
      ORDER BY auth_sso_provider.sort_order, auth_sso_provider.created_at
    `,
  );

  return result.rows.map(mapProviderRow);
}

async function createSsoProviderClient(client: PoolClient, input: SsoProviderInput): Promise<SsoProviderRecord> {
  const issues = validateSsoProviderInput(input, { requireSecret: true });
  if (issues.length > 0) {
    throw new Error(issues.join("; "));
  }
  const normalizedProtocol = input.protocol === undefined && isProviderPreset(input.preset)
    ? presetProtocol(input.preset)
    : normalizeProviderProtocol(input.protocol);
  const normalizedPreset = normalizeProviderPreset(input.preset, normalizedProtocol);
  const normalizedClientSecretRef = normalizeOptionalString(input.clientSecretRef);
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO auth_sso_provider (
        provider_id,
        display_name,
        button_label,
        logo_url,
        protocol,
        preset,
        discovery_url,
        authorization_url,
        token_url,
        user_info_url,
        client_id,
        client_secret,
        client_secret_ref,
        scopes,
        enabled,
        sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id
    `,
    [
      input.providerId.trim(),
      input.displayName.trim(),
      normalizeOptionalString(input.buttonLabel),
      normalizeOptionalString(input.logoUrl),
      normalizedProtocol,
      normalizedPreset,
      normalizeOptionalString(input.discoveryUrl),
      normalizeOptionalString(input.authorizationUrl),
      normalizeOptionalString(input.tokenUrl),
      normalizeOptionalString(input.userInfoUrl),
      normalizeOptionalString(input.clientId),
      null,
      normalizedClientSecretRef,
      normalizeScopes(input.scopes),
      Boolean(input.enabled),
      normalizeInteger(input.sortOrder, 0),
    ],
  );
  await replaceAdminRules(client, result.rows[0].id, input);
  return getSsoProviderByIdClient(client, result.rows[0].id);
}

async function updateSsoProviderClient(client: PoolClient, patch: SsoProviderPatch): Promise<SsoProviderRecord> {
  const issues = validateSsoProviderInput(patch, { requireSecret: false });
  if (issues.length > 0) {
    throw new Error(issues.join("; "));
  }

  const fields: Array<[string, string | number | boolean | null]> = [];
  addField(fields, "provider_id", patch.providerId?.trim());
  addField(fields, "display_name", patch.displayName?.trim());
  addField(fields, "button_label", normalizeOptionalString(patch.buttonLabel));
  addField(fields, "logo_url", normalizeOptionalString(patch.logoUrl));
  const normalizedProtocol = patch.protocol === undefined ? undefined : normalizeProviderProtocol(patch.protocol);
  const normalizedPreset =
    patch.preset === undefined && normalizedProtocol === undefined
      ? undefined
      : normalizeProviderPreset(patch.preset, normalizedProtocol);
  addField(fields, "protocol", normalizedProtocol ?? (normalizedPreset ? presetProtocol(normalizedPreset) : undefined));
  addField(fields, "preset", normalizedPreset);
  addField(fields, "discovery_url", normalizeOptionalString(patch.discoveryUrl));
  addField(fields, "authorization_url", normalizeOptionalString(patch.authorizationUrl));
  addField(fields, "token_url", normalizeOptionalString(patch.tokenUrl));
  addField(fields, "user_info_url", normalizeOptionalString(patch.userInfoUrl));
  addField(fields, "client_id", normalizeOptionalString(patch.clientId));
  const normalizedClientSecretRef = patch.clientSecretRef === undefined ? undefined : normalizeOptionalString(patch.clientSecretRef);
  if (patch.clientSecretRef !== undefined) {
    addField(fields, "client_secret_ref", normalizedClientSecretRef);
    if (normalizedClientSecretRef) {
      addField(fields, "client_secret", null);
    }
  }
  if (patch.scopes !== undefined) {
    addField(fields, "scopes", normalizeScopes(patch.scopes));
  }
  if (patch.enabled !== undefined) {
    addField(fields, "enabled", Boolean(patch.enabled));
  }
  if (patch.sortOrder !== undefined) {
    addField(fields, "sort_order", normalizeInteger(patch.sortOrder, 0));
  }

  if (fields.length > 0) {
    const assignments = fields.map(([column], index) => `${column} = $${index + 2}`);
    const result = await client.query(
      `
        UPDATE auth_sso_provider
        SET ${assignments.join(", ")},
            updated_at = now()
        WHERE id = $1
      `,
      [patch.id, ...fields.map(([, value]) => value)],
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new Error("SSO provider was not found");
    }
  }

  if (patch.adminEmailAllowlist !== undefined || patch.adminClaim !== undefined || patch.adminClaimValue !== undefined) {
    await replaceAdminRules(client, patch.id, patch);
  }

  return getSsoProviderByIdClient(client, patch.id);
}

async function getSsoProviderByIdClient(client: PoolClient, id: string): Promise<SsoProviderRecord> {
  const providers = await listSsoProvidersClient(client);
  const provider = providers.find((entry) => entry.id === id);
  if (!provider) {
    throw new Error("SSO provider was not found");
  }
  return provider;
}

async function replaceAdminRules(client: PoolClient, providerId: string, input: SsoProviderInput | SsoProviderPatch): Promise<void> {
  await client.query("DELETE FROM auth_sso_admin_rule WHERE provider_id = $1", [providerId]);
  const rules: Array<{ type: SsoAdminRuleType; value: string }> = [];
  for (const value of normalizeList(input.adminEmailAllowlist)) {
    rules.push({ type: "email_allowlist", value });
  }
  const adminClaim = normalizeOptionalString(input.adminClaim);
  const adminClaimValue = normalizeOptionalString(input.adminClaimValue);
  if (adminClaim && adminClaimValue) {
    rules.push({ type: "claim_equals", value: `${adminClaim}=${adminClaimValue}` });
  }
  for (const rule of rules) {
    await client.query(
      `
        INSERT INTO auth_sso_admin_rule (provider_id, rule_type, rule_value)
        VALUES ($1, $2, $3)
        ON CONFLICT (provider_id, rule_type, rule_value) DO NOTHING
      `,
      [providerId, rule.type, rule.value],
    );
  }
}

function addField(fields: Array<[string, string | number | boolean | null]>, column: string, value: string | number | boolean | null | undefined): void {
  if (value !== undefined) {
    fields.push([column, value]);
  }
}

type ProviderRow = {
  id: string;
  provider_id: string;
  display_name: string;
  button_label: string | null;
  logo_url: string | null;
  protocol: SsoProviderProtocol;
  preset: SsoProviderPreset;
  discovery_url: string | null;
  authorization_url: string | null;
  token_url: string | null;
  user_info_url: string | null;
  client_id: string | null;
  client_secret: string | null;
  client_secret_ref: string | null;
  scopes: string;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type RuleRow = {
  id: string;
  type: SsoAdminRuleType;
  value: string;
};

function mapProviderRow(row: ProviderRow & { rules: RuleRow[] | null }): SsoProviderRecord {
  return {
    id: row.id,
    providerId: row.provider_id,
    displayName: row.display_name,
    buttonLabel: row.button_label ?? `Continue with ${row.display_name}`,
    logoUrl: row.logo_url,
    protocol: row.protocol,
    preset: row.preset,
    discoveryUrl: row.discovery_url,
    authorizationUrl: row.authorization_url,
    tokenUrl: row.token_url,
    userInfoUrl: row.user_info_url,
    clientId: row.client_id,
    clientSecret: row.client_secret,
    clientSecretRef: row.client_secret_ref,
    clientSecretConfigured: Boolean(row.client_secret_ref || row.client_secret),
    scopes: normalizeScopes(row.scopes).split(" "),
    enabled: row.enabled,
    sortOrder: row.sort_order,
    adminRules: row.rules ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeScopes(value: string[] | string | null | undefined): string {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s]+/) : [];
  const scopes = items.map((item) => item.trim()).filter(Boolean);
  return scopes.length > 0 ? scopes.join(" ") : "openid email profile";
}

function normalizeList(value: string[] | string | null | undefined): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]+/) : [];
  return items.map((item) => item.trim()).filter(Boolean);
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeProviderProtocol(value: string | null | undefined): SsoProviderProtocol {
  return isProviderProtocol(value) ? value : "oidc";
}

function normalizeProviderPreset(value: string | null | undefined, protocol: SsoProviderProtocol = "oidc"): SsoProviderPreset {
  if (isProviderPreset(value)) {
    return value;
  }
  return protocol === "oauth2" ? "custom_oauth2" : "custom_oidc";
}

function presetProtocol(value: SsoProviderPreset): SsoProviderProtocol {
  return value.endsWith("_oauth2") ? "oauth2" : "oidc";
}

function normalizeInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function isProviderId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{1,62}$/.test(value);
}

function isProviderProtocol(value: unknown): value is SsoProviderProtocol {
  return value === "oidc" || value === "oauth2";
}

function isProviderPreset(value: unknown): value is SsoProviderPreset {
  return (
    value === "custom_oidc" ||
    value === "custom_oauth2" ||
    value === "google_oidc" ||
    value === "microsoft_entra_oidc" ||
    value === "auth0_oidc" ||
    value === "okta_oidc"
  );
}

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
