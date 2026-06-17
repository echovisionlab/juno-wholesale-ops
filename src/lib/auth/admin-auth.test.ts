import { describe, expect, it } from "vitest";

import {
  buildLoginRedirectUrl,
  buildPublicRequestUrl,
  buildSessionCookieHeader,
  buildWhoamiUrl,
  extractAdminSessionUser,
  isAdminAuthProviderConfigured,
  loadAdminAuthConfig,
  normalizeBaseUrl,
  parseSessionCookieNames,
  resolveAuthEnabled,
  shouldBypassAdminAuth,
  shouldRedirectToLogin,
  type KratosWhoamiSession,
} from "./admin-auth";

describe("resolveAuthEnabled", () => {
  it("defaults to disabled auth when unset", () => {
    expect(resolveAuthEnabled(undefined)).toBe(false);
    expect(resolveAuthEnabled("")).toBe(false);
  });

  it("honors explicit truthy and falsey values", () => {
    expect(resolveAuthEnabled("yes")).toBe(true);
    expect(resolveAuthEnabled("OFF")).toBe(false);
  });

  it("treats invalid values as disabled", () => {
    expect(resolveAuthEnabled("sometimes")).toBe(false);
  });
});

describe("auth config parsing", () => {
  it("loads open-source safe defaults", () => {
    expect(loadAdminAuthConfig({ NODE_ENV: "production" })).toEqual({
      enabled: false,
      kratosPublicUrl: "",
      loginUrl: "",
      loginRedirectParam: "redirect",
      requiredRole: "admin",
      sessionCookieNames: ["session"],
    });
    expect(isAdminAuthProviderConfigured(loadAdminAuthConfig({ NODE_ENV: "production" }))).toBe(false);
  });

  it("loads explicit overrides", () => {
    expect(
      loadAdminAuthConfig({
        NODE_ENV: "production",
        AUTH_ADMIN_ENABLED: "true",
        AUTH_ADMIN_KRATOS_PUBLIC_URL: "https://auth.example.test/",
        AUTH_ADMIN_LOGIN_URL: "https://www.example.test/login",
        AUTH_ADMIN_LOGIN_REDIRECT_PARAM: "return_to",
        AUTH_ADMIN_REQUIRED_ROLE: "manager",
        AUTH_ADMIN_SESSION_COOKIE_NAMES: "custom, session, custom",
      })
    ).toEqual({
      enabled: true,
      kratosPublicUrl: "https://auth.example.test",
      loginUrl: "https://www.example.test/login",
      loginRedirectParam: "return_to",
      requiredRole: "manager",
      sessionCookieNames: ["custom", "session"],
    });
    expect(
      isAdminAuthProviderConfigured(
        loadAdminAuthConfig({
          AUTH_ADMIN_ENABLED: "true",
          AUTH_ADMIN_KRATOS_PUBLIC_URL: "https://auth.example.test/",
          AUTH_ADMIN_LOGIN_URL: "https://www.example.test/login",
          AUTH_ADMIN_SESSION_COOKIE_NAMES: "custom",
        }),
      ),
    ).toBe(true);
  });

  it("normalizes base URLs and cookie names", () => {
    expect(normalizeBaseUrl("https://auth.example.test///", "https://fallback.test")).toBe(
      "https://auth.example.test"
    );
    expect(normalizeBaseUrl("   ", "https://fallback.test/")).toBe("https://fallback.test");
    expect(parseSessionCookieNames(" , ")).toEqual(["session"]);
  });
});

describe("request matching", () => {
  it("bypasses health checks, next assets, public files, and known metadata files", () => {
    expect(shouldBypassAdminAuth("/api/health")).toBe(true);
    expect(shouldBypassAdminAuth("/_next/static/chunk.js")).toBe(true);
    expect(shouldBypassAdminAuth("/favicon.ico")).toBe(true);
    expect(shouldBypassAdminAuth("/robots.txt")).toBe(true);
    expect(shouldBypassAdminAuth("/sitemap.xml")).toBe(true);
    expect(shouldBypassAdminAuth("/logo.svg")).toBe(true);
  });

  it("protects app and API paths by default", () => {
    expect(shouldBypassAdminAuth("/")).toBe(false);
    expect(shouldBypassAdminAuth("/api/catalogs")).toBe(false);
  });

  it("redirects browser-like app requests but not API requests", () => {
    expect(shouldRedirectToLogin("/dashboard", null)).toBe(true);
    expect(shouldRedirectToLogin("/dashboard", "text/html,application/xhtml+xml")).toBe(true);
    expect(shouldRedirectToLogin("/dashboard", "*/*")).toBe(true);
    expect(shouldRedirectToLogin("/dashboard", "application/json")).toBe(false);
    expect(shouldRedirectToLogin("/api/catalogs", "text/html")).toBe(false);
  });
});

describe("cookie and URL helpers", () => {
  it("forwards only configured non-empty session cookies", () => {
    expect(
      buildSessionCookieHeader(
        [
          { name: "theme", value: "dark" },
          { name: "dev_session", value: "dev-session" },
          { name: "session", value: "" },
        ],
        ["session", "dev_session"]
      )
    ).toBe("dev_session=dev-session");
  });

  it("builds Kratos whoami and login redirect URLs", () => {
    expect(buildWhoamiUrl("https://auth.example.com/")).toBe("https://auth.example.com/sessions/whoami");

    const redirectUrl = buildLoginRedirectUrl(
      "https://login.example.com/auth/login?provider=google",
      "redirect",
      "https://inventory.example.com/catalogs?kind=preorders"
    );

    expect(redirectUrl.toString()).toBe(
      "https://login.example.com/auth/login?provider=google&redirect=https%3A%2F%2Finventory.example.com%2Fcatalogs%3Fkind%3Dpreorders"
    );
  });

  it("reconstructs the public request URL from forwarded headers", () => {
    expect(
      buildPublicRequestUrl({
        requestUrl: "http://0.0.0.0:3000/catalogs?kind=preorders",
        hostHeader: "127.0.0.1:3103",
        forwardedHost: "inventory.example.com, internal.proxy",
        forwardedProto: "https",
      })
    ).toBe("https://inventory.example.com/catalogs?kind=preorders");
  });

  it("falls back to Host and then the internal request URL", () => {
    expect(
      buildPublicRequestUrl({
        requestUrl: "http://0.0.0.0:3000/",
        hostHeader: "127.0.0.1:3103",
        forwardedHost: null,
        forwardedProto: null,
      })
    ).toBe("http://127.0.0.1:3103/");

    expect(
      buildPublicRequestUrl({
        requestUrl: "http://0.0.0.0:3000/",
        hostHeader: null,
        forwardedHost: " ",
        forwardedProto: "http:",
      })
    ).toBe("http://0.0.0.0:3000/");
  });
});

describe("extractAdminSessionUser", () => {
  const adminSession: KratosWhoamiSession = {
    active: true,
    identity: {
      id: "user-1",
      traits: {
        email: "admin@example.com",
        name: "Admin User",
        image: "https://cdn.example.com/avatar.png",
        preferred_locale: "ko",
      },
      metadata_public: {
        role: "Admin",
      },
    },
  };

  it("extracts active sessions with the required role", () => {
    expect(extractAdminSessionUser(adminSession, "admin")).toEqual({
      id: "user-1",
      email: "admin@example.com",
      name: "Admin User",
      image: "https://cdn.example.com/avatar.png",
      preferredLocale: "ko",
      role: "Admin",
    });
  });

  it("rejects inactive, anonymous, missing-role, and wrong-role sessions", () => {
    expect(extractAdminSessionUser({ ...adminSession, active: false }, "admin")).toBeNull();
    expect(extractAdminSessionUser({ active: true, identity: null }, "admin")).toBeNull();
    expect(
      extractAdminSessionUser(
        { active: true, identity: { metadata_public: { role: "admin" } } },
        "admin"
      )
    ).toBeNull();
    expect(
      extractAdminSessionUser(
        { active: true, identity: { id: "user-2", metadata_public: null } },
        "admin"
      )
    ).toBeNull();
    expect(extractAdminSessionUser(adminSession, "manager")).toBeNull();
  });
});
