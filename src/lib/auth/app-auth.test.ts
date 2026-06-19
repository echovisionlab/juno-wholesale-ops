import { describe, expect, it } from "vitest";
import { buildAppAuthOptions } from "./app-auth";
import type { AppAuthSettings } from "./settings";

describe("buildAppAuthOptions", () => {
  it("builds generic OAuth config for OIDC discovery and OAuth2 endpoint providers", () => {
    const options = buildAppAuthOptions({
      database: {} as never,
      settings: authSettings({
        externalProviders: [
          {
            id: "provider-oidc",
            providerId: "workspace",
            name: "Workspace",
            buttonLabel: "Continue with Workspace",
            logoUrl: undefined,
            protocol: "oidc",
            discoveryUrl: "https://login.example.test/.well-known/openid-configuration",
            authorizationUrl: "",
            tokenUrl: "",
            userInfoUrl: "",
            clientId: "oidc-client",
            clientSecret: "oidc-secret",
            scopes: ["openid", "email"],
            adminRules: [],
          },
          {
            id: "provider-oauth2",
            providerId: "custom-oauth2",
            name: "Custom OAuth2",
            buttonLabel: "Continue with OAuth2",
            logoUrl: undefined,
            protocol: "oauth2",
            discoveryUrl: "",
            authorizationUrl: "https://login.example.test/oauth/authorize",
            tokenUrl: "https://login.example.test/oauth/token",
            userInfoUrl: "https://login.example.test/oauth/userinfo",
            clientId: "oauth2-client",
            clientSecret: "oauth2-secret",
            scopes: ["email"],
            adminRules: [],
          },
          {
            id: "provider-missing",
            providerId: "missing-oauth2",
            name: "Missing OAuth2",
            buttonLabel: "Continue with Missing",
            logoUrl: undefined,
            protocol: "oauth2",
            discoveryUrl: "",
            authorizationUrl: "",
            tokenUrl: "",
            userInfoUrl: "",
            clientId: "missing-client",
            clientSecret: "missing-secret",
            scopes: ["email"],
            adminRules: [],
          },
        ],
      }),
    });

    expect(options.emailAndPassword.enabled).toBe(true);
    const genericOAuthPlugin = options.plugins[0] as { options?: { config?: Array<Record<string, unknown>> } };
    expect(genericOAuthPlugin.options?.config).toMatchObject([
      {
        providerId: "workspace",
        discoveryUrl: "https://login.example.test/.well-known/openid-configuration",
        authorizationUrl: undefined,
        tokenUrl: undefined,
        userInfoUrl: undefined,
        clientId: "oidc-client",
      },
      {
        providerId: "custom-oauth2",
        discoveryUrl: undefined,
        authorizationUrl: "https://login.example.test/oauth/authorize",
        tokenUrl: "https://login.example.test/oauth/token",
        userInfoUrl: "https://login.example.test/oauth/userinfo",
        clientId: "oauth2-client",
      },
    ]);
  });
});

function authSettings(overrides: Partial<AppAuthSettings>): AppAuthSettings {
  return {
    secret: "a".repeat(32),
    baseUrl: "https://inventory-dev.example.test",
    trustedOrigins: [],
    emailPasswordLoginEnabled: true,
    externalProviders: [],
    initialAdmin: null,
    ...overrides,
  };
}
