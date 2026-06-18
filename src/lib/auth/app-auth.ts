import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import { resolveExternalProfileRole, type AppAuthSettings } from "./settings";
import { appAuthSchema } from "./schema";

type AuthDatabase = {
  db: Kysely<unknown>;
  pool: Pool;
  ownsPool: boolean;
};

export type AppAuthInstance = {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession: (options: { headers: Headers }) => Promise<unknown>;
    signUpEmail: (options: {
      body: { email: string; password: string; name: string };
      headers: Headers;
    }) => Promise<unknown>;
  };
};

type CachedAuth = {
  key: string;
  auth: AppAuthInstance;
  database: AuthDatabase;
};

type GenericOAuthUserMap = Partial<{
  id: string;
  createdAt: Date;
  updatedAt: Date;
  email: string;
  emailVerified: boolean;
  name: string;
  image: string | null;
}> & {
  role?: "admin" | "user";
};

let cachedAuth: CachedAuth | null = null;

export function createAuthDatabase(databaseUrl: string, pool?: Pool): AuthDatabase {
  const authPool = pool ?? new Pool({ connectionString: databaseUrl, max: 5 });
  return {
    pool: authPool,
    ownsPool: !pool,
    db: new Kysely<unknown>({
      dialect: new PostgresDialect({ pool: authPool }),
    }),
  };
}

export function buildAppAuthOptions(options: {
  database: Kysely<unknown>;
  settings: AppAuthSettings;
}) {
  const plugins = [];

  if (options.settings.externalProvider) {
    plugins.push(
      genericOAuth({
        config: [
          {
            providerId: options.settings.externalProvider.providerId,
            clientId: options.settings.externalProvider.clientId,
            clientSecret: options.settings.externalProvider.clientSecret,
            discoveryUrl: options.settings.externalProvider.discoveryUrl,
            scopes: options.settings.externalProvider.scopes,
            mapProfileToUser: (profile): GenericOAuthUserMap => ({
              role: resolveExternalProfileRole(profile, options.settings),
            }),
          },
        ],
      }),
    );
  }

  plugins.push(nextCookies());

  return {
    appName: "Juno Wholesale Ops",
    baseURL: options.settings.baseUrl,
    trustedOrigins: options.settings.trustedOrigins,
    secret: options.settings.secret,
    database: {
      db: options.database,
      type: "postgres" as const,
    },
    emailAndPassword: {
      enabled: options.settings.emailPasswordEnabled,
    },
    user: appAuthSchema.user,
    session: appAuthSchema.session,
    account: appAuthSchema.account,
    verification: appAuthSchema.verification,
    plugins,
  };
}

export async function getCachedAppAuth(options: {
  databaseUrl: string;
  settings: AppAuthSettings;
}) {
  const key = JSON.stringify({
    databaseUrl: options.databaseUrl,
    settings: {
      baseUrl: options.settings.baseUrl,
      trustedOrigins: options.settings.trustedOrigins,
      emailPasswordEnabled: options.settings.emailPasswordEnabled,
      externalProviderEnabled: options.settings.externalProviderEnabled,
      externalProvider: options.settings.externalProvider
        ? {
            providerId: options.settings.externalProvider.providerId,
            discoveryUrl: options.settings.externalProvider.discoveryUrl,
            clientId: options.settings.externalProvider.clientId,
            scopes: options.settings.externalProvider.scopes,
          }
        : null,
    },
  });

  if (cachedAuth?.key === key) {
    return cachedAuth.auth;
  }

  await closeCachedAppAuth();
  const database = createAuthDatabase(options.databaseUrl);
  const auth = betterAuth(buildAppAuthOptions({ database: database.db, settings: options.settings })) as AppAuthInstance;
  cachedAuth = { key, auth, database };
  return auth;
}

async function closeCachedAppAuth(): Promise<void> {
  const previous = cachedAuth;
  cachedAuth = null;

  if (!previous) {
    return;
  }

  await previous.database.db.destroy();
}
