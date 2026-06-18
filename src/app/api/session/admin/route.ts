import { getRuntimeBetterAuth } from "@/lib/auth/runtime";

export const dynamic = "force-dynamic";

type BetterAuthSessionPayload = {
  user?: {
    id?: string;
    email?: string;
    name?: string;
    image?: string | null;
    role?: string | null;
  } | null;
} | null;

export async function GET(request: Request): Promise<Response> {
  const { auth, runtime, unavailable } = await getRuntimeBetterAuth({ requestOrigin: getRequestOrigin(request) });

  if (unavailable || !auth) {
    return Response.json(
      { error: "auth_unavailable", missing: runtime.missing },
      { status: 503 },
    );
  }

  const session = (await auth.api.getSession({
    headers: request.headers,
  })) as BetterAuthSessionPayload;
  const user = session?.user;

  if (!user?.id) {
    return Response.json({ error: "authentication_required" }, { status: 401 });
  }

  if (user.role !== "admin") {
    return Response.json({ error: "admin_required" }, { status: 403 });
  }

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
    },
  });
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
