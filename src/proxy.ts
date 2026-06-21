import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_FILE_EXTENSION_RE =
  /\.(?:avif|css|gif|ico|jpg|jpeg|js|map|png|svg|txt|webmanifest|webp|woff|woff2)$/i;

const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

function shouldBypassAuth(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname === "/api/health" ||
    pathname === "/api/version" ||
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

function authRequiredResponse(request: NextRequest): NextResponse {
  const publicRequestUrl = buildPublicRequestUrl(request);
  const loginUrl = new URL("/login", publicRequestUrl);
  loginUrl.searchParams.set("redirect", publicRequestUrl);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (shouldBypassAuth(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (!hasSessionCookie(request)) {
    return authRequiredResponse(request);
  }

  return NextResponse.next();
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

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => Boolean(request.cookies.get(name)?.value));
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|robots.txt|sitemap.xml).*)"],
};
