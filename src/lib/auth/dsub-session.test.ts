import { describe, expect, it } from "vitest";

import {
  buildLoginRedirectUrl,
  buildPublicRequestUrl,
  buildSessionCookieHeader,
  buildWhoamiUrl,
  extractAdminSessionUser,
  loadDsubAuthConfig,
  normalizeBaseUrl,
  parseSessionCookieNames,
  resolveAuthEnabled,
  shouldBypassDsubAuth,
  shouldRedirectToLogin,
  type KratosWhoamiSession,
} from "./dsub-session";

describe("resolveAuthEnabled", () => {
  it("defaults to production-only auth when unset", () => {
    expect(resolveAuthEnabled(undefined, "production")).toBe(true);
    expect(resolveAuthEnabled("", "development")).toBe(false);
  });

  it("honors explicit truthy and falsey values", () => {
    expect(resolveAuthEnabled("yes", "development")).toBe(true);
    expect(resolveAuthEnabled("OFF", "production")).toBe(false);
  });

  it("falls back to NODE_ENV for invalid values", () => {
    expect(resolveAuthEnabled("sometimes", "production")).toBe(true);
    expect(resolveAuthEnabled("sometimes", "test")).toBe(false);
  });
});

describe("auth config parsing", () => {
  it("loads secure dsub defaults", () => {
    expect(loadDsubAuthConfig({ NODE_ENV: "production" })).toEqual({
      enabled: true,
      kratosPublicUrl: "https://auth.dsub.io",
      loginUrl: "https://www.dsub.io/auth/login",
      loginRedirectParam: "redirect",
      requiredRole: "admin",
      sessionCookieNames: ["dsub_session", "dsub_session_dev"],
    });
  });

  it("loads explicit overrides", () => {
    expect(
      loadDsubAuthConfig({
        NODE_ENV: "production",
        DSUB_AUTH_ENABLED: "false",
        DSUB_KRATOS_PUBLIC_URL: "https://auth.example.test/",
        DSUB_LOGIN_URL: "https://www.example.test/login",
        DSUB_LOGIN_REDIRECT_PARAM: "return_to",
        DSUB_REQUIRED_ROLE: "manager",
        DSUB_SESSION_COOKIE_NAMES: "custom, dsub_session, custom",
      })
    ).toEqual({
      enabled: false,
      kratosPublicUrl: "https://auth.example.test",
      loginUrl: "https://www.example.test/login",
      loginRedirectParam: "return_to",
      requiredRole: "manager",
      sessionCookieNames: ["custom", "dsub_session"],
    });
  });

  it("normalizes base URLs and cookie names", () => {
    expect(normalizeBaseUrl("https://auth.example.test///", "https://fallback.test")).toBe(
      "https://auth.example.test"
    );
    expect(normalizeBaseUrl("   ", "https://fallback.test/")).toBe("https://fallback.test");
    expect(parseSessionCookieNames(" , ")).toEqual(["dsub_session", "dsub_session_dev"]);
  });
});

describe("request matching", () => {
  it("bypasses health checks, next assets, public files, and known metadata files", () => {
    expect(shouldBypassDsubAuth("/api/health")).toBe(true);
    expect(shouldBypassDsubAuth("/_next/static/chunk.js")).toBe(true);
    expect(shouldBypassDsubAuth("/favicon.ico")).toBe(true);
    expect(shouldBypassDsubAuth("/robots.txt")).toBe(true);
    expect(shouldBypassDsubAuth("/sitemap.xml")).toBe(true);
    expect(shouldBypassDsubAuth("/logo.svg")).toBe(true);
  });

  it("protects app and API paths by default", () => {
    expect(shouldBypassDsubAuth("/")).toBe(false);
    expect(shouldBypassDsubAuth("/api/catalogs")).toBe(false);
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
          { name: "dsub_session_dev", value: "dev-session" },
          { name: "dsub_session", value: "" },
        ],
        ["dsub_session", "dsub_session_dev"]
      )
    ).toBe("dsub_session_dev=dev-session");
  });

  it("builds Kratos whoami and dsub login redirect URLs", () => {
    expect(buildWhoamiUrl("https://auth.dsub.io/")).toBe("https://auth.dsub.io/sessions/whoami");

    const redirectUrl = buildLoginRedirectUrl(
      "https://www.dsub.io/auth/login?provider=google",
      "redirect",
      "https://inventory.dsub.io/catalogs?kind=preorders"
    );

    expect(redirectUrl.toString()).toBe(
      "https://www.dsub.io/auth/login?provider=google&redirect=https%3A%2F%2Finventory.dsub.io%2Fcatalogs%3Fkind%3Dpreorders"
    );
  });

  it("reconstructs the public request URL from forwarded headers", () => {
    expect(
      buildPublicRequestUrl({
        requestUrl: "http://0.0.0.0:3000/catalogs?kind=preorders",
        hostHeader: "127.0.0.1:3103",
        forwardedHost: "inventory.dsub.io, internal.proxy",
        forwardedProto: "https",
      })
    ).toBe("https://inventory.dsub.io/catalogs?kind=preorders");
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
        email: "admin@dsub.io",
        name: "Admin User",
        image: "https://cdn.dsub.io/avatar.png",
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
      email: "admin@dsub.io",
      name: "Admin User",
      image: "https://cdn.dsub.io/avatar.png",
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
