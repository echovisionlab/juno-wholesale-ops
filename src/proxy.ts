import { NextResponse, type NextRequest } from "next/server";

import {
  buildLoginRedirectUrl,
  buildPublicRequestUrl,
  buildSessionCookieHeader,
  buildWhoamiUrl,
  extractAdminSessionUser,
  isAdminAuthProviderConfigured,
  loadAdminAuthConfig,
  shouldBypassAdminAuth,
  shouldRedirectToLogin,
  type AdminAuthConfig,
  type KratosWhoamiSession,
} from "@/lib/auth/admin-auth";

function authRequiredResponse(request: NextRequest, config: AdminAuthConfig): NextResponse {
  if (shouldRedirectToLogin(request.nextUrl.pathname, request.headers.get("accept"))) {
    const publicRequestUrl = buildPublicRequestUrl({
      requestUrl: request.url,
      hostHeader: request.headers.get("host"),
      forwardedHost: request.headers.get("x-forwarded-host"),
      forwardedProto: request.headers.get("x-forwarded-proto"),
    });

    return NextResponse.redirect(
      buildLoginRedirectUrl(config.loginUrl, config.loginRedirectParam, publicRequestUrl)
    );
  }

  return NextResponse.json({ error: "authentication_required" }, { status: 401 });
}

function forbiddenResponse(): NextResponse {
  return NextResponse.json({ error: "admin_required" }, { status: 403 });
}

function authUnavailableResponse(): NextResponse {
  return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
}

function withUserHeaders(
  request: NextRequest,
  session: KratosWhoamiSession,
  requiredRole: string
): NextResponse {
  const user = extractAdminSessionUser(session, requiredRole);
  const requestHeaders = new Headers(request.headers);

  if (user) {
    requestHeaders.set("x-juno-wholesale-ops-user-id", user.id);
    requestHeaders.set("x-juno-wholesale-ops-user-role", user.role);
    if (user.email) {
      requestHeaders.set("x-juno-wholesale-ops-user-email", user.email);
    }
    if (user.name) {
      requestHeaders.set("x-juno-wholesale-ops-user-name", user.name);
    }
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const config = loadAdminAuthConfig();
  const pathname = request.nextUrl.pathname;

  if (!config.enabled || shouldBypassAdminAuth(pathname)) {
    return NextResponse.next();
  }

  if (!isAdminAuthProviderConfigured(config)) {
    return authUnavailableResponse();
  }

  const sessionCookieHeader = buildSessionCookieHeader(
    request.cookies.getAll(),
    config.sessionCookieNames
  );

  if (!sessionCookieHeader) {
    return authRequiredResponse(request, config);
  }

  let whoamiResponse: Response;

  try {
    whoamiResponse = await fetch(buildWhoamiUrl(config.kratosPublicUrl), {
      headers: {
        accept: "application/json",
        cookie: sessionCookieHeader,
      },
      cache: "no-store",
    });
  } catch {
    return authUnavailableResponse();
  }

  if (whoamiResponse.status === 401) {
    return authRequiredResponse(request, config);
  }

  if (!whoamiResponse.ok) {
    return authUnavailableResponse();
  }

  let session: KratosWhoamiSession;

  try {
    session = (await whoamiResponse.json()) as KratosWhoamiSession;
  } catch {
    return authUnavailableResponse();
  }

  if (!extractAdminSessionUser(session, config.requiredRole)) {
    return forbiddenResponse();
  }

  return withUserHeaders(request, session, config.requiredRole);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
