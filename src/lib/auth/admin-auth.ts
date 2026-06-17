export interface CookieLike {
  name: string;
  value: string;
}

export interface AdminAuthConfig {
  enabled: boolean;
  kratosPublicUrl: string;
  loginUrl: string;
  loginRedirectParam: string;
  requiredRole: string;
  sessionCookieNames: string[];
}

export interface KratosWhoamiSession {
  active?: boolean;
  identity?: {
    id?: string;
    traits?: {
      email?: string;
      name?: string;
      image?: string;
      preferred_locale?: string;
    };
    metadata_public?: {
      role?: string;
    } | null;
  } | null;
}

export interface AdminSessionUser {
  id: string;
  email?: string;
  name?: string;
  image?: string;
  preferredLocale?: string;
  role: string;
}

const DEFAULT_KRATOS_PUBLIC_URL = "";
const DEFAULT_LOGIN_URL = "";
const DEFAULT_LOGIN_REDIRECT_PARAM = "redirect";
const DEFAULT_REQUIRED_ROLE = "admin";
const DEFAULT_SESSION_COOKIE_NAMES = ["session"] as const;
const PUBLIC_FILE_EXTENSION_RE =
  /\.(?:avif|css|gif|ico|jpg|jpeg|js|map|png|svg|txt|webmanifest|webp|woff|woff2)$/i;

type AdminAuthEnv = Record<string, string | undefined>;

export function resolveAuthEnabled(value: string | undefined): boolean {
  const normalizedValue = value?.trim().toLowerCase();

  if (!normalizedValue) {
    return false;
  }

  if (["1", "true", "yes", "on"].includes(normalizedValue)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalizedValue)) {
    return false;
  }

  return false;
}

export function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const url = value?.trim() || fallback;
  return url.replace(/\/+$/, "");
}

export function parseSessionCookieNames(value: string | undefined): string[] {
  const names =
    value
      ?.split(",")
      .map((name) => name.trim())
      .filter(Boolean) ?? [];

  return names.length ? [...new Set(names)] : [...DEFAULT_SESSION_COOKIE_NAMES];
}

export function loadAdminAuthConfig(env: AdminAuthEnv = process.env): AdminAuthConfig {
  return {
    enabled: resolveAuthEnabled(env.AUTH_ADMIN_ENABLED),
    kratosPublicUrl: normalizeBaseUrl(env.AUTH_ADMIN_KRATOS_PUBLIC_URL, DEFAULT_KRATOS_PUBLIC_URL),
    loginUrl: env.AUTH_ADMIN_LOGIN_URL?.trim() || DEFAULT_LOGIN_URL,
    loginRedirectParam: env.AUTH_ADMIN_LOGIN_REDIRECT_PARAM?.trim() || DEFAULT_LOGIN_REDIRECT_PARAM,
    requiredRole: env.AUTH_ADMIN_REQUIRED_ROLE?.trim() || DEFAULT_REQUIRED_ROLE,
    sessionCookieNames: parseSessionCookieNames(env.AUTH_ADMIN_SESSION_COOKIE_NAMES),
  };
}

export function isAdminAuthProviderConfigured(config: AdminAuthConfig): boolean {
  return Boolean(config.kratosPublicUrl && config.loginUrl && config.sessionCookieNames.length > 0);
}

export function shouldBypassAdminAuth(pathname: string): boolean {
  return (
    pathname === "/api/health" ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/_next/") ||
    PUBLIC_FILE_EXTENSION_RE.test(pathname)
  );
}

export function buildSessionCookieHeader(
  cookies: Iterable<CookieLike>,
  sessionCookieNames: readonly string[]
): string {
  const allowedCookieNames = new Set(sessionCookieNames);

  return Array.from(cookies)
    .filter((cookie) => allowedCookieNames.has(cookie.name) && cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export function buildWhoamiUrl(kratosPublicUrl: string): string {
  return new URL("/sessions/whoami", `${kratosPublicUrl}/`).toString();
}

export function extractAdminSessionUser(
  session: KratosWhoamiSession,
  requiredRole: string
): AdminSessionUser | null {
  const identity = session.identity;
  const role = identity?.metadata_public?.role;

  if (!session.active || !identity?.id || !role) {
    return null;
  }

  if (role.toLowerCase() !== requiredRole.toLowerCase()) {
    return null;
  }

  return {
    id: identity.id,
    email: identity.traits?.email,
    name: identity.traits?.name,
    image: identity.traits?.image,
    preferredLocale: identity.traits?.preferred_locale,
    role,
  };
}

export function shouldRedirectToLogin(pathname: string, acceptHeader: string | null): boolean {
  if (pathname.startsWith("/api/")) {
    return false;
  }

  if (!acceptHeader) {
    return true;
  }

  return acceptHeader.includes("text/html") || acceptHeader.includes("*/*");
}

export function buildLoginRedirectUrl(
  loginUrl: string,
  redirectParam: string,
  requestUrl: string
): URL {
  const url = new URL(loginUrl);
  url.searchParams.set(redirectParam, requestUrl);
  return url;
}

function firstForwardedHeaderValue(value: string | null): string | null {
  const firstValue = value?.split(",")[0]?.trim();
  return firstValue || null;
}

export function buildPublicRequestUrl(options: {
  requestUrl: string;
  hostHeader: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
}): string {
  const url = new URL(options.requestUrl);
  const host =
    firstForwardedHeaderValue(options.forwardedHost) ??
    firstForwardedHeaderValue(options.hostHeader) ??
    url.host;
  const proto = firstForwardedHeaderValue(options.forwardedProto) ?? url.protocol.replace(":", "");

  url.host = host;
  if (!host.includes(":")) {
    url.port = "";
  }
  url.protocol = `${proto.replace(/:$/, "")}:`;

  return url.toString();
}
