import { createHash } from "node:crypto";
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
  const readyProviders = options.settings.externalProviders.filter(isExternalProviderReady);

  if (readyProviders.length > 0) {
    plugins.push(
      genericOAuth({
        config: readyProviders.map((provider) => ({
          providerId: provider.providerId,
          clientId: provider.clientId,
          clientSecret: provider.clientSecret,
          discoveryUrl: provider.discoveryUrl || undefined,
          authorizationUrl: provider.authorizationUrl || undefined,
          tokenUrl: provider.tokenUrl || undefined,
          userInfoUrl: provider.userInfoUrl || undefined,
          scopes: provider.scopes,
          mapProfileToUser: (profile): GenericOAuthUserMap => ({
            role: resolveExternalProfileRole(profile, options.settings, provider.providerId),
          }),
        })),
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
      enabled: options.settings.emailPasswordLoginEnabled,
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
        secretHash: hashSecret(options.settings.secret ?? ""),
        baseUrl: options.settings.baseUrl,
        trustedOrigins: options.settings.trustedOrigins,
        emailPasswordLoginEnabled: options.settings.emailPasswordLoginEnabled,
        externalProviders: options.settings.externalProviders.map((provider) => ({
          providerId: provider.providerId,
          discoveryUrl: provider.discoveryUrl,
          authorizationUrl: provider.authorizationUrl,
          tokenUrl: provider.tokenUrl,
          userInfoUrl: provider.userInfoUrl,
          clientId: provider.clientId,
        clientSecretHash: hashSecret(provider.clientSecret),
        scopes: provider.scopes,
        adminRules: provider.adminRules,
      })),
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

function isExternalProviderReady(provider: AppAuthSettings["externalProviders"][number]): boolean {
  const endpointsReady = provider.protocol === "oauth2"
    ? isUrl(provider.discoveryUrl) || (isUrl(provider.authorizationUrl) && isUrl(provider.tokenUrl) && isUrl(provider.userInfoUrl))
    : isUrl(provider.discoveryUrl);
  return Boolean(
    provider?.providerId.trim()
      && endpointsReady
      && provider.clientId.trim()
      && provider.clientSecret.trim(),
  );
}

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function closeCachedAppAuth(): Promise<void> {
  const previous = cachedAuth;
  cachedAuth = null;

  if (!previous) {
    return;
  }

  await previous.database.db.destroy();
}
