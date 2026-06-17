export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { runStartupMigrations } = await import("./lib/db/startup-migrations");
  await runStartupMigrations();
}
