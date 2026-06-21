import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdmin } from "@/lib/auth/admin";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ProtectedLayout from "./layout";
import Page from "./page";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("../dashboard-client", () => ({
  default: () => <div data-testid="dashboard-client">Dashboard client</div>,
}));

const headersMock = vi.mocked(headers);
const redirectMock = vi.mocked(redirect);
const requireAdminMock = vi.mocked(requireAdmin);

describe("protected layout authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    headersMock.mockResolvedValue(new Headers({
      "x-juno-wholesale-ops-request-url": "https://inventory.dsub.io/settings",
      "x-forwarded-host": "inventory.dsub.io",
      "x-forwarded-proto": "https",
    }) as never);
  });

  it("renders protected children after layout-level admin authorization passes", async () => {
    requireAdminMock.mockResolvedValue({
      authorized: true,
      user: {
        id: "admin-1",
        email: "admin@example.test",
        name: "Admin",
        image: null,
        role: "admin",
      },
    });

    const markup = renderToStaticMarkup(await ProtectedLayout({ children: <div>Protected content</div> }));

    expect(markup).toContain("Protected content");
    expect(requireAdminMock).toHaveBeenCalledWith(expect.any(Request));
  });

  it("redirects unauthenticated page requests to login with the proxy-provided public redirect target", async () => {
    requireAdminMock.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: "authentication_required" }, { status: 401 }),
    });

    await expect(ProtectedLayout({ children: <div /> })).rejects.toThrow(
      "NEXT_REDIRECT:/login?redirect=https%3A%2F%2Finventory.dsub.io%2Fsettings",
    );
    expect(redirectMock).toHaveBeenCalledWith("/login?redirect=https%3A%2F%2Finventory.dsub.io%2Fsettings");
  });

  it("falls back to forwarded origin when the proxy request URL header is missing", async () => {
    headersMock.mockResolvedValue(new Headers({
      "x-forwarded-host": "inventory.dsub.io",
      "x-forwarded-proto": "https",
    }) as never);
    requireAdminMock.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: "authentication_required" }, { status: 401 }),
    });

    await expect(ProtectedLayout({ children: <div /> })).rejects.toThrow(
      "NEXT_REDIRECT:/login?redirect=https%3A%2F%2Finventory.dsub.io%2F",
    );
    expect(redirectMock).toHaveBeenCalledWith("/login?redirect=https%3A%2F%2Finventory.dsub.io%2F");
  });

  it("falls back to forwarded origin when the proxy request URL header is invalid", async () => {
    headersMock.mockResolvedValue(new Headers({
      "x-juno-wholesale-ops-request-url": "not a url",
      "x-forwarded-host": "inventory.dsub.io",
      "x-forwarded-proto": "https",
    }) as never);
    requireAdminMock.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: "authentication_required" }, { status: 401 }),
    });

    await expect(ProtectedLayout({ children: <div /> })).rejects.toThrow(
      "NEXT_REDIRECT:/login?redirect=https%3A%2F%2Finventory.dsub.io%2F",
    );
    expect(redirectMock).toHaveBeenCalledWith("/login?redirect=https%3A%2F%2Finventory.dsub.io%2F");
  });

  it("renders admin-required failures at the layout boundary", async () => {
    requireAdminMock.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: "admin_required" }, { status: 403 }),
    });

    const markup = renderToStaticMarkup(await ProtectedLayout({ children: <div /> }));

    expect(markup).toContain("Operator page unavailable");
    expect(markup).toContain("Admin access is required");
  });

  it("renders auth unavailable failures with missing settings", async () => {
    requireAdminMock.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: "auth_unavailable", missing: ["auth_base_url"] }, { status: 503 }),
    });

    const markup = renderToStaticMarkup(await ProtectedLayout({ children: <div /> }));

    expect(markup).toContain("Auth is enabled but unavailable. Missing: auth_base_url.");
  });

  it("renders auth unavailable failures without raw missing details", async () => {
    requireAdminMock.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: "auth_unavailable" }, { status: 503 }),
    });

    const markup = renderToStaticMarkup(await ProtectedLayout({ children: <div /> }));

    expect(markup).toContain("required auth settings");
  });

  it("renders non-auth authorization errors from the response payload", async () => {
    requireAdminMock.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: "maintenance" }, { status: 503 }),
    });

    const markup = renderToStaticMarkup(await ProtectedLayout({ children: <div /> }));

    expect(markup).toContain("maintenance");
  });

  it("renders a status fallback when the authorization response is not JSON", async () => {
    requireAdminMock.mockResolvedValue({
      authorized: false,
      response: new Response("nope", { status: 502 }),
    });

    const markup = renderToStaticMarkup(await ProtectedLayout({ children: <div /> }));

    expect(markup).toContain("Protected page authorization failed with HTTP 502");
  });

  it("keeps the dashboard page as protected layout content", () => {
    const markup = renderToStaticMarkup(<Page />);

    expect(markup).toContain("Dashboard client");
  });
});
