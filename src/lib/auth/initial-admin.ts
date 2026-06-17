import { Pool } from "pg";

import { buildAppAuthOptions, createAuthDatabase, type AppAuthInstance } from "./app-auth";
import type { AppAuthSettings, InitialAdminSettings } from "./settings";

export type SeedInitialAdminResult =
  | { status: "skipped"; reason: "missing_config" | "duplicate" }
  | { status: "created"; email: string };

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
  const initialAdmin = options.settings.initialAdmin;

  if (!initialAdmin) {
    return { status: "skipped", reason: "missing_config" };
  }

  const database = createAuthDatabase(options.databaseUrl, options.pool);
  try {
    return await seedInitialAdminWithPool({
      pool: database.pool,
      initialAdmin,
      createUser: async () => {
        const auth = await import("better-auth").then(({ betterAuth }) =>
          betterAuth(
            buildAppAuthOptions({
              database: database.db,
              settings: {
                ...options.settings,
                enabled: true,
                emailPasswordEnabled: true,
              },
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
    });
  } finally {
    await closeSeedAuthDatabase(database);
  }
}

export async function closeSeedAuthDatabase(database: SeedAuthDatabase): Promise<void> {
  await database.db.destroy();
  if (database.ownsPool) {
    await database.pool.end();
  }
}

export async function seedInitialAdminWithPool(options: {
  pool: Pool;
  initialAdmin: InitialAdminSettings;
  createUser: () => Promise<void>;
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

  return { status: "created", email: options.initialAdmin.email };
}
