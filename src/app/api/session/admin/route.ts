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
  const { auth, runtime, unavailable } = await getRuntimeBetterAuth();

  if (!runtime.settings.enabled) {
    return Response.json({ enabled: false });
  }

  if (unavailable || !auth) {
    return Response.json(
      { enabled: true, error: "auth_unavailable", missing: runtime.missing },
      { status: 503 },
    );
  }

  const session = (await auth.api.getSession({
    headers: request.headers,
  })) as BetterAuthSessionPayload;
  const user = session?.user;

  if (!user?.id) {
    return Response.json({ enabled: true, error: "authentication_required" }, { status: 401 });
  }

  if (user.role !== "admin") {
    return Response.json({ enabled: true, error: "admin_required" }, { status: 403 });
  }

  return Response.json({
    enabled: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
    },
  });
}
