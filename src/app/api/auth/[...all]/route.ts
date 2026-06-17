import { getRuntimeBetterAuth } from "@/lib/auth/runtime";

export const dynamic = "force-dynamic";

async function handleAuthRequest(request: Request): Promise<Response> {
  const { auth, runtime, unavailable } = await getRuntimeBetterAuth();

  if (!runtime.settings.enabled) {
    return Response.json({ error: "auth_disabled" }, { status: 404 });
  }

  if (unavailable || !auth) {
    return Response.json(
      { error: "auth_unavailable", missing: runtime.missing },
      { status: 503 },
    );
  }

  return auth.handler(request);
}

export const GET = handleAuthRequest;
export const POST = handleAuthRequest;
export const PATCH = handleAuthRequest;
export const PUT = handleAuthRequest;
export const DELETE = handleAuthRequest;
