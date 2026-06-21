import { describe, expect, it } from "vitest";
import { isSupportedSecretRef, resolveSecretRef } from "./secret-ref";

describe("resolveSecretRef", () => {
  it("resolves explicit environment references", () => {
    const env = {
      WORKSPACE_CLIENT_SECRET: "  env-secret  ",
    };

    expect(resolveSecretRef("env:WORKSPACE_CLIENT_SECRET", { env })).toEqual({
      value: "env-secret",
      source: "env",
    });
  });

  it("resolves file references without exposing missing files as values", () => {
    expect(resolveSecretRef("file:/run/secrets/workspace", {
      readFile: (path) => path === "/run/secrets/workspace" ? "file-secret\n" : "",
    })).toEqual({
      value: "file-secret",
      source: "file",
    });

    expect(resolveSecretRef("file:/missing", {
      readFile: () => {
        throw new Error("missing");
      },
    })).toEqual({
      value: null,
      source: "file",
    });
  });

  it("returns null for empty and unsupported references", () => {
    expect(resolveSecretRef("", { env: {} })).toEqual({ value: null, source: "unset" });
    expect(resolveSecretRef("aws-sm://workspace/client-secret", { env: {} })).toEqual({
      value: null,
      source: "unsupported",
    });
    expect(resolveSecretRef("WORKSPACE_CLIENT_SECRET", { env: { WORKSPACE_CLIENT_SECRET: "secret" } })).toEqual({
      value: null,
      source: "unsupported",
    });
  });

  it("validates only explicit env and file reference forms", () => {
    expect(isSupportedSecretRef("env:WORKSPACE_CLIENT_SECRET")).toBe(true);
    expect(isSupportedSecretRef("file:/run/secrets/workspace")).toBe(true);
    expect(isSupportedSecretRef("env:")).toBe(false);
    expect(isSupportedSecretRef("file:")).toBe(false);
    expect(isSupportedSecretRef("file:relative-secret")).toBe(false);
    expect(isSupportedSecretRef("WORKSPACE_CLIENT_SECRET")).toBe(false);
    expect(isSupportedSecretRef("aws-sm://workspace/client-secret")).toBe(false);
  });
});
