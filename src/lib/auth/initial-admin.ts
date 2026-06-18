import { randomBytes } from "node:crypto";
import { Pool } from "pg";

import { buildAppAuthOptions, createAuthDatabase, type AppAuthInstance } from "./app-auth";
import type { AppAuthSettings, InitialAdminSettings } from "./settings";

export type SeedInitialAdminResult =
  | { status: "skipped"; reason: "duplicate" | "existing_admin" }
  | { status: "created"; source: "env"; email: string }
  | { status: "created"; source: "generated"; email: string; password: string };

export type SeedAuthDatabase = {
  db: { destroy: () => Promise<void> };
  pool: { end: () => Promise<void> };
  ownsPool: boolean;
};

export async function seedInitialAdmin(options: {
  databaseUrl: string;
  settings: AppAuthSettings;
  pool?: Pool;
}): Promise<SeedInitialAdminResult> {
  const database = createAuthDatabase(options.databaseUrl, options.pool);
  try {
    const initialAdmin = options.settings.initialAdmin ?? await generatedInitialAdminIfNeeded(database.pool);
    if (!initialAdmin) {
      return { status: "skipped", reason: "existing_admin" };
    }
    const source = options.settings.initialAdmin ? "env" : "generated";
    return await seedInitialAdminWithPool({
      pool: database.pool,
      initialAdmin,
      createUser: async () => {
        const auth = await import("better-auth").then(({ betterAuth }) =>
          betterAuth(
            buildAppAuthOptions({
              database: database.db,
              settings: options.settings,
            }),
          ) as AppAuthInstance,
        );
        await auth.api.signUpEmail({
          body: {
            email: initialAdmin.email,
            password: initialAdmin.password,
            name: initialAdmin.name,
          },
          headers: new Headers(),
        });
      },
      source,
    });
  } finally {
    await closeSeedAuthDatabase(database);
  }
}

export async function closeSeedAuthDatabase(database: SeedAuthDatabase): Promise<void> {
  if (!database.ownsPool) {
    return;
  }
  await database.db.destroy();
}

export async function seedInitialAdminWithPool(options: {
  pool: Pool;
  initialAdmin: InitialAdminSettings;
  createUser: () => Promise<void>;
  source?: "env" | "generated";
}): Promise<SeedInitialAdminResult> {
  const existing = await options.pool.query<{ id: string }>(
    `
      SELECT id
      FROM auth_user
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [options.initialAdmin.email],
  );

  if (existing.rows.length > 0) {
    return { status: "skipped", reason: "duplicate" };
  }

  await options.createUser();
  await options.pool.query(
    `
      UPDATE auth_user
      SET role = 'admin',
          email_verified = true,
          updated_at = now()
      WHERE lower(email) = lower($1)
    `,
    [options.initialAdmin.email],
  );

  if (options.source === "generated") {
    return {
      status: "created",
      source: "generated",
      email: options.initialAdmin.email,
      password: options.initialAdmin.password,
    };
  }

  return { status: "created", source: "env", email: options.initialAdmin.email };
}

async function generatedInitialAdminIfNeeded(pool: Pool): Promise<InitialAdminSettings | null> {
  const existing = await pool.query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM auth_user
      WHERE role = 'admin'
    `,
  );
  if (Number(existing.rows[0]?.count ?? 0) > 0) {
    return null;
  }

  const suffix = randomBytes(6).toString("hex");
  return {
    email: `admin+${suffix}@localhost.invalid`,
    password: randomBytes(24).toString("base64url"),
    name: "Generated Admin",
  };
}
