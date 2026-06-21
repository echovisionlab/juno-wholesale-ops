import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { getRequestOrigin } from "@/lib/http/request-origin";

const PUBLIC_REQUEST_URL_HEADER = "x-juno-wholesale-ops-request-url";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const request = new Request("http://localhost/", { headers: new Headers(requestHeaders) });
  const authorization = await requireAdmin(request);

  if (!authorization.authorized) {
    if (authorization.response.status === 401) {
      redirect(buildLoginRedirectPath(requestHeaders));
    }

    return <ProtectedAuthorizationError message={await describeAuthorizationFailure(authorization.response)} />;
  }

  return children;
}

function buildLoginRedirectPath(requestHeaders: Headers): string {
  const fallbackRequest = new Request("http://localhost/", { headers: requestHeaders });
  const targetUrl = readPublicRequestUrl(requestHeaders) ?? new URL("/", getRequestOrigin(fallbackRequest)).toString();
  const loginUrl = new URL("/login", targetUrl);
  loginUrl.searchParams.set("redirect", targetUrl);
  return `${loginUrl.pathname}${loginUrl.search}`;
}

function readPublicRequestUrl(requestHeaders: Headers): string | null {
  const value = requestHeaders.get(PUBLIC_REQUEST_URL_HEADER);
  if (!value) {
    return null;
  }
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

async function describeAuthorizationFailure(response: Response): Promise<string> {
  const payload = (await response.clone().json().catch(() => ({}))) as { error?: string; missing?: string[] };
  if (response.status === 403) {
    return "Admin access is required before this operator page can load.";
  }
  if (payload.error === "auth_unavailable") {
    return `Auth is enabled but unavailable. Missing: ${payload.missing?.join(", ") || "required auth settings"}.`;
  }
  return payload.error ?? `Protected page authorization failed with HTTP ${response.status}.`;
}

function ProtectedAuthorizationError({ message }: { message: string }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Operator page unavailable</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
