import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

describe("proxy optimistic auth redirect", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("redirects protected page requests without a Better Auth session cookie", async () => {
    const response = await proxy(
      request("http://internal.local/settings", {
        accept: "text/html",
        host: "internal.local",
        "x-forwarded-host": "inventory.dsub.io",
        "x-forwarded-proto": "https",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://inventory.dsub.io/login?redirect=https%3A%2F%2Finventory.dsub.io%2Fsettings",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows protected page requests with a Better Auth session cookie", async () => {
    const response = await proxy(
      request("https://inventory.dsub.io/", {
        cookie: "better-auth.session_token=signed-token",
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-x-juno-wholesale-ops-request-url")).toBe(
      "https://inventory.dsub.io/",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows secure-prefixed Better Auth session cookies", async () => {
    const response = await proxy(
      request("https://inventory.dsub.io/settings", {
        cookie: "__Secure-better-auth.session_token=signed-token",
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-x-juno-wholesale-ops-request-url")).toBe(
      "https://inventory.dsub.io/settings",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bypasses API routes so route handlers own authorization responses", async () => {
    const response = await proxy(request("https://inventory.dsub.io/api/settings/status"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(fetch).not.toHaveBeenCalled();
  });
});

function request(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers });
}
