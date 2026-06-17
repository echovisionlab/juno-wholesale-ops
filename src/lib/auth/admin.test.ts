import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdmin } from "./admin";
import { getRuntimeBetterAuth } from "./runtime";

vi.mock("./runtime", () => ({
  getRuntimeBetterAuth: vi.fn(),
}));

const getRuntimeBetterAuthMock = vi.mocked(getRuntimeBetterAuth);

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("allows requests when the auth gate is disabled", async () => {
    getRuntimeBetterAuthMock.mockResolvedValue({
      runtime: runtime({ enabled: false }),
      auth: null,
      unavailable: false,
    });

    await expect(requireAdmin(new Request("http://app.test/api/settings/status"))).resolves.toEqual({
      authorized: true,
      enabled: false,
      user: null,
    });
  });

  it("returns auth_unavailable when enabled auth cannot run", async () => {
    getRuntimeBetterAuthMock.mockResolvedValue({
      runtime: runtime({ enabled: true, missing: ["AUTH_SECRET"] }),
      auth: null,
      unavailable: true,
    });

    const result = await requireAdmin(new Request("http://app.test/api/settings/status"));

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(503);
      await expect(result.response.json()).resolves.toEqual({
        enabled: true,
        error: "auth_unavailable",
        missing: ["AUTH_SECRET"],
      });
    }
  });

  it("requires an authenticated session", async () => {
    getRuntimeBetterAuthMock.mockResolvedValue({
      runtime: runtime({ enabled: true }),
      auth: authWithSession(null),
      unavailable: false,
    });

    const result = await requireAdmin(new Request("http://app.test/api/settings/status"));

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({
        enabled: true,
        error: "authentication_required",
      });
    }
  });

  it("rejects non-admin users", async () => {
    getRuntimeBetterAuthMock.mockResolvedValue({
      runtime: runtime({ enabled: true }),
      auth: authWithSession({ user: { id: "user-1", role: "user" } }),
      unavailable: false,
    });

    const result = await requireAdmin(new Request("http://app.test/api/settings/status"));

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toEqual({
        enabled: true,
        error: "admin_required",
      });
    }
  });

  it("returns the admin user for an authorized request", async () => {
    const getSession = vi.fn(async () => ({
      user: {
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        image: null,
        role: "admin",
      },
    }));
    getRuntimeBetterAuthMock.mockResolvedValue({
      runtime: runtime({ enabled: true }),
      auth: {
        handler: vi.fn(),
        api: {
          getSession,
          signUpEmail: vi.fn(),
        },
      },
      unavailable: false,
    });
    const request = new Request("http://app.test/api/settings/status", {
      headers: { cookie: "better-auth.session_token=token" },
    });

    await expect(requireAdmin(request)).resolves.toEqual({
      authorized: true,
      enabled: true,
      user: {
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        image: null,
        role: "admin",
      },
    });
    expect(getSession).toHaveBeenCalledWith({ headers: request.headers });
  });

  it("treats a missing auth instance as unavailable while auth is enabled", async () => {
    getRuntimeBetterAuthMock.mockResolvedValue({
      runtime: runtime({ enabled: true, missing: [] }),
      auth: null,
      unavailable: false,
    });

    const result = await requireAdmin(new Request("http://app.test/api/settings/status"));

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(503);
      await expect(result.response.json()).resolves.toEqual({
        enabled: true,
        error: "auth_unavailable",
        missing: [],
      });
    }
  });
});

function runtime(options: { enabled: boolean; missing?: string[] }) {
  return {
    databaseUrl: "postgres://user:pass@localhost:5432/app",
    settings: {
      enabled: options.enabled,
      secret: undefined,
      baseUrl: undefined,
      trustedOrigins: [],
      emailPasswordEnabled: true,
      externalProviderEnabled: false,
      externalProvider: null,
      initialAdmin: null,
    },
    missing: options.missing ?? [],
  };
}

function authWithSession(session: unknown) {
  return {
    handler: vi.fn(),
    api: {
      getSession: vi.fn(async () => session),
      signUpEmail: vi.fn(),
    },
  };
}
