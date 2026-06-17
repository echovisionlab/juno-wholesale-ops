import { getAuthTables } from "better-auth/db";
import { describe, expect, it } from "vitest";
import { appAuthSchema, authTableNames } from "./schema";

describe("appAuthSchema", () => {
  it("maps Better Auth core tables to app-owned snake_case tables", () => {
    const tables = getAuthTables(appAuthSchema);

    expect(tables.user.modelName).toBe(authTableNames.user);
    expect(tables.session.modelName).toBe(authTableNames.session);
    expect(tables.account.modelName).toBe(authTableNames.account);
    expect(tables.verification.modelName).toBe(authTableNames.verification);
    expect(tables.user.fields.emailVerified.fieldName).toBe("email_verified");
    expect(tables.session.fields.userId.fieldName).toBe("user_id");
    expect(tables.account.fields.accessToken.fieldName).toBe("access_token");
    expect(tables.verification.fields.expiresAt.fieldName).toBe("expires_at");
  });

  it("adds a non-user-input role field for admin authorization", () => {
    const tables = getAuthTables(appAuthSchema);

    expect(tables.user.fields.role).toMatchObject({
      type: ["user", "admin"],
      defaultValue: "user",
      input: false,
    });
  });
});
