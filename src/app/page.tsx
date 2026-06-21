import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { getRequestOrigin } from "@/lib/http/request-origin";
import DashboardHomeClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const request = new Request("http://localhost/", { headers: new Headers(requestHeaders) });
  const authorization = await requireAdmin(request);

  if (!authorization.authorized) {
    if (authorization.response.status === 401) {
      redirect(buildLoginRedirectPath(request));
    }

    return <DashboardAuthorizationError message={await describeAuthorizationFailure(authorization.response)} />;
  }

  return <DashboardHomeClient />;
}

function buildLoginRedirectPath(request: Request): string {
  const targetUrl = new URL("/", getRequestOrigin(request));
  const loginUrl = new URL("/login", targetUrl);
  loginUrl.searchParams.set("redirect", targetUrl.toString());
  return `${loginUrl.pathname}${loginUrl.search}`;
}

async function describeAuthorizationFailure(response: Response): Promise<string> {
  const payload = (await response.clone().json().catch(() => ({}))) as { error?: string; missing?: string[] };
  if (response.status === 403) {
    return "Admin access is required before the dashboard can load operator data.";
  }
  if (payload.error === "auth_unavailable") {
    return `Auth is enabled but unavailable. Missing: ${payload.missing?.join(", ") || "required auth settings"}.`;
  }
  return payload.error ?? `Dashboard authorization failed with HTTP ${response.status}.`;
}

function DashboardAuthorizationError({ message }: { message: string }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Dashboard unavailable</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
