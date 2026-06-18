import { getRuntimeBetterAuth } from "@/lib/auth/runtime";

export const dynamic = "force-dynamic";

async function handleAuthRequest(request: Request): Promise<Response> {
  const { auth, runtime, unavailable } = await getRuntimeBetterAuth({ requestOrigin: getRequestOrigin(request) });

  if (unavailable || !auth) {
    return Response.json(
      { error: "auth_unavailable", missing: runtime.missing },
      { status: 503 },
    );
  }

  return auth.handler(request);
}

function getRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = firstForwardedHeader(request.headers.get("x-forwarded-proto"));
  const forwardedHost = firstForwardedHeader(request.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? request.headers.get("host") ?? url.host;
  const proto = forwardedProto ?? url.protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}

function firstForwardedHeader(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

export const GET = handleAuthRequest;
export const POST = handleAuthRequest;
export const PATCH = handleAuthRequest;
export const PUT = handleAuthRequest;
export const DELETE = handleAuthRequest;
