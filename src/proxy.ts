import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_FILE_EXTENSION_RE =
  /\.(?:avif|css|gif|ico|jpg|jpeg|js|map|png|svg|txt|webmanifest|webp|woff|woff2)$/i;

type AdminSessionResponse = {
  enabled?: boolean;
  error?: string;
  user?: {
    id?: string;
    email?: string;
    name?: string;
    role?: string;
  };
};

function shouldBypassAuth(pathname: string): boolean {
  return (
    pathname === "/api/health" ||
    pathname === "/api/session/admin" ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    PUBLIC_FILE_EXTENSION_RE.test(pathname)
  );
}

function shouldRedirectToLogin(pathname: string, acceptHeader: string | null): boolean {
  if (pathname.startsWith("/api/")) {
    return false;
  }

  if (!acceptHeader) {
    return true;
  }

  return acceptHeader.includes("text/html") || acceptHeader.includes("*/*");
}

function authRequiredResponse(request: NextRequest): NextResponse {
  if (shouldRedirectToLogin(request.nextUrl.pathname, request.headers.get("accept"))) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", buildPublicRequestUrl(request));
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.json({ error: "authentication_required" }, { status: 401 });
}

function withUserHeaders(request: NextRequest, user: NonNullable<AdminSessionResponse["user"]>): NextResponse {
  const requestHeaders = new Headers(request.headers);

  if (user.id) {
    requestHeaders.set("x-juno-wholesale-ops-user-id", user.id);
  }
  if (user.role) {
    requestHeaders.set("x-juno-wholesale-ops-user-role", user.role);
  }
  if (user.email) {
    requestHeaders.set("x-juno-wholesale-ops-user-email", user.email);
  }
  if (user.name) {
    requestHeaders.set("x-juno-wholesale-ops-user-name", user.name);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (shouldBypassAuth(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  let sessionResponse: Response;

  try {
    sessionResponse = await fetch(buildSessionCheckUrl(request), {
      headers: {
        accept: "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
  }

  const payload = (await sessionResponse.json().catch(() => null)) as AdminSessionResponse | null;

  if (sessionResponse.ok && payload?.enabled === false) {
    return NextResponse.next();
  }

  if (sessionResponse.ok && payload?.user?.role === "admin") {
    return withUserHeaders(request, payload.user);
  }

  if (sessionResponse.status === 401) {
    return authRequiredResponse(request);
  }

  if (sessionResponse.status === 403) {
    return NextResponse.json({ error: "admin_required" }, { status: 403 });
  }

  return NextResponse.json(
    { error: payload?.error ?? "auth_unavailable" },
    { status: sessionResponse.status === 503 ? 503 : 401 },
  );
}

function firstForwardedHeaderValue(value: string | null): string | null {
  const firstValue = value?.split(",")[0]?.trim();
  return firstValue || null;
}

function buildPublicRequestUrl(request: NextRequest): string {
  const url = new URL(request.url);
  const host =
    firstForwardedHeaderValue(request.headers.get("x-forwarded-host")) ??
    firstForwardedHeaderValue(request.headers.get("host")) ??
    url.host;
  const proto = firstForwardedHeaderValue(request.headers.get("x-forwarded-proto")) ?? url.protocol.replace(":", "");

  url.host = host;
  if (!host.includes(":")) {
    url.port = "";
  }
  url.protocol = `${proto.replace(/:$/, "")}:`;

  return url.toString();
}

function buildSessionCheckUrl(request: NextRequest): URL {
  const internalOrigin = process.env.JUNO_WHOLESALE_OPS_AUTH_PROXY_INTERNAL_ORIGIN?.trim();

  if (internalOrigin) {
    return new URL("/api/session/admin", internalOrigin);
  }

  return new URL("/api/session/admin", buildPublicRequestUrl(request));
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|robots.txt|sitemap.xml).*)"],
};
