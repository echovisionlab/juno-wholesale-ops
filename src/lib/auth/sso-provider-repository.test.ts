import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createSsoProvider,
  deleteSsoProvider,
  listSsoProviders,
  redactSsoProvider,
  updateSsoProvider,
  validateSsoProviderInput,
  validateSsoProviderReadiness,
} from "./sso-provider-repository";
import {
  resetApplicationTables,
  startMigratedPostgresTestDatabase,
  type StartedPostgresTestDatabase,
} from "@/test/postgres";

describe("SSO provider repository", () => {
  let database: StartedPostgresTestDatabase;
  let databaseUrl: string;

  beforeAll(async () => {
    database = await startMigratedPostgresTestDatabase();
    databaseUrl = database.container.getConnectionUri();
  });

  beforeEach(async () => {
    await resetApplicationTables(database.pool);
  });

  afterAll(async () => {
    await database.stop();
  });

  it("creates, redacts, updates, and deletes provider-scoped SSO settings", async () => {
    const created = await createSsoProvider(databaseUrl, {
      providerId: "workspace",
      displayName: "Workspace",
      buttonLabel: "Continue with Workspace",
      logoUrl: "https://login.example.test/logo.svg",
      discoveryUrl: "https://login.example.test/.well-known/openid-configuration",
      clientId: "client-id",
      clientSecret: "client-secret",
      scopes: "openid email profile groups",
      enabled: true,
      sortOrder: 10,
      adminEmailAllowlist: "admin@example.test\nowner@example.test",
      adminClaim: "groups",
      adminClaimValue: "ops-admins",
    });

    expect(created).toMatchObject({
      providerId: "workspace",
      displayName: "Workspace",
      clientSecret: "client-secret",
      clientSecretConfigured: true,
      protocol: "oidc",
      preset: "custom_oidc",
      authorizationUrl: null,
      tokenUrl: null,
      userInfoUrl: null,
      scopes: ["openid", "email", "profile", "groups"],
      adminRules: expect.arrayContaining([
        expect.objectContaining({ type: "email_allowlist", value: "admin@example.test" }),
        expect.objectContaining({ type: "email_allowlist", value: "owner@example.test" }),
        expect.objectContaining({ type: "claim_equals", value: "groups=ops-admins" }),
      ]),
    });

    const [listed] = await listSsoProviders(databaseUrl);
    const publicProvider = redactSsoProvider(listed, "https://inventory-dev.example.test");
    expect(publicProvider).toMatchObject({
      providerId: "workspace",
      clientSecretConfigured: true,
      status: "ready",
      callbackUrl: "https://inventory-dev.example.test/api/auth/oauth2/callback/workspace",
    });
    expect(JSON.stringify(publicProvider)).not.toContain("client-secret");

    await updateSsoProvider(databaseUrl, {
      id: created.id,
      displayName: "Renamed Workspace",
      clientSecret: "",
      adminEmailAllowlist: ["admin@example.test"],
      adminClaim: null,
      adminClaimValue: null,
    });

    const [updated] = await listSsoProviders(databaseUrl);
    expect(updated).toMatchObject({
      displayName: "Renamed Workspace",
      clientSecret: "client-secret",
      protocol: "oidc",
      preset: "custom_oidc",
      adminRules: [expect.objectContaining({ type: "email_allowlist", value: "admin@example.test" })],
    });

    await updateSsoProvider(databaseUrl, {
      id: created.id,
      protocol: "oauth2",
    });

    const [oauth2Updated] = await listSsoProviders(databaseUrl);
    expect(oauth2Updated).toMatchObject({
      protocol: "oauth2",
      preset: "custom_oauth2",
    });

    await updateSsoProvider(databaseUrl, {
      id: created.id,
      preset: "custom_oidc",
    });

    const [oidcUpdated] = await listSsoProviders(databaseUrl);
    expect(oidcUpdated).toMatchObject({
      protocol: "oidc",
      preset: "custom_oidc",
    });

    await updateSsoProvider(databaseUrl, {
      id: created.id,
      protocol: "oauth2",
      preset: "custom_oauth2",
      discoveryUrl: "",
      authorizationUrl: "https://login.example.test/oauth/authorize",
      tokenUrl: "https://login.example.test/oauth/token",
      userInfoUrl: "https://login.example.test/oauth/userinfo",
    });

    const [oauth2EndpointsUpdated] = await listSsoProviders(databaseUrl);
    expect(oauth2EndpointsUpdated).toMatchObject({
      protocol: "oauth2",
      preset: "custom_oauth2",
      discoveryUrl: null,
      authorizationUrl: "https://login.example.test/oauth/authorize",
      tokenUrl: "https://login.example.test/oauth/token",
      userInfoUrl: "https://login.example.test/oauth/userinfo",
    });

    await expect(deleteSsoProvider(databaseUrl, created.id)).resolves.toEqual({ deleted: true });
    await expect(listSsoProviders(databaseUrl)).resolves.toEqual([]);
  });

  it("validates provider input and readiness without exposing secrets", () => {
    expect(validateSsoProviderInput({ providerId: "Bad Provider", displayName: "" }, { requireSecret: true })).toEqual([
      "providerId must start with a lowercase letter or digit and contain only lowercase letters, digits, underscores, or dashes",
      "displayName is required",
      "clientSecret is required when creating a provider",
    ]);
    expect(validateSsoProviderInput({
      providerId: "workspace",
      displayName: "Workspace",
      protocol: "oauth2",
      preset: "custom_oidc",
    }, { requireSecret: false })).toEqual(["preset must match protocol"]);
    expect(validateSsoProviderInput({
      providerId: "workspace",
      displayName: "Workspace",
      adminClaim: "groups",
      adminClaimValue: "",
    }, { requireSecret: false })).toEqual(["adminClaim and adminClaimValue must be configured together"]);

    expect(validateSsoProviderReadiness({
      enabled: false,
      providerId: "workspace",
      displayName: "Workspace",
      protocol: "oidc",
      discoveryUrl: null,
      authorizationUrl: null,
      tokenUrl: null,
      userInfoUrl: null,
      clientId: null,
      clientSecretConfigured: false,
    }, null)).toEqual({ status: "disabled", missing: [], invalid: [] });

    expect(validateSsoProviderReadiness({
      enabled: true,
      providerId: "workspace",
      displayName: "Workspace",
      protocol: "oidc",
      discoveryUrl: "not-a-url",
      authorizationUrl: null,
      tokenUrl: null,
      userInfoUrl: null,
      clientId: "client-id",
      clientSecretConfigured: false,
    }, "https://inventory-dev.example.test")).toEqual({
      status: "missing",
      missing: ["client secret"],
      invalid: ["discovery URL"],
    });

    expect(validateSsoProviderReadiness({
      enabled: true,
      providerId: "workspace",
      displayName: "Workspace",
      protocol: "oauth2",
      discoveryUrl: null,
      authorizationUrl: "https://login.example.test/oauth/authorize",
      tokenUrl: "https://login.example.test/oauth/token",
      userInfoUrl: "https://login.example.test/oauth/userinfo",
      clientId: "client-id",
      clientSecretConfigured: true,
    }, "https://inventory-dev.example.test")).toEqual({ status: "ready", missing: [], invalid: [] });
  });

  it("infers protocol from preset when creating providers", async () => {
    const created = await createSsoProvider(databaseUrl, {
      providerId: "custom-oauth2",
      displayName: "Custom OAuth2",
      preset: "custom_oauth2",
      authorizationUrl: "https://login.example.test/oauth/authorize",
      tokenUrl: "https://login.example.test/oauth/token",
      userInfoUrl: "https://login.example.test/oauth/userinfo",
      clientId: "client-id",
      clientSecret: "client-secret",
    });

    expect(created).toMatchObject({
      protocol: "oauth2",
      preset: "custom_oauth2",
      discoveryUrl: null,
    });
  });
});
