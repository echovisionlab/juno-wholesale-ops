import { getRuntimeBetterAuth } from "./runtime";

type BetterAuthSessionPayload = {
  user?: {
    id?: string;
    email?: string;
    name?: string;
    image?: string | null;
    role?: string | null;
  } | null;
} | null;

export type AdminUser = {
  id: string;
  email?: string;
  name?: string;
  image?: string | null;
  role: "admin";
};

export type AdminAuthorization =
  | {
      authorized: true;
      enabled: boolean;
      user: AdminUser | null;
    }
  | {
      authorized: false;
      response: Response;
    };

export async function requireAdmin(request: Request): Promise<AdminAuthorization> {
  const { auth, runtime, unavailable } = await getRuntimeBetterAuth();

  if (!runtime.settings.enabled) {
    return { authorized: true, enabled: false, user: null };
  }

  if (unavailable || !auth) {
    return {
      authorized: false,
      response: Response.json(
        { enabled: true, error: "auth_unavailable", missing: runtime.missing },
        { status: 503 },
      ),
    };
  }

  const session = (await auth.api.getSession({
    headers: request.headers,
  })) as BetterAuthSessionPayload;
  const user = session?.user;

  if (!user?.id) {
    return {
      authorized: false,
      response: Response.json({ enabled: true, error: "authentication_required" }, { status: 401 }),
    };
  }

  if (user.role !== "admin") {
    return {
      authorized: false,
      response: Response.json({ enabled: true, error: "admin_required" }, { status: 403 }),
    };
  }

  return {
    authorized: true,
    enabled: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: "admin",
    },
  };
}
