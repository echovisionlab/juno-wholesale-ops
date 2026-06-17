import { describe, expect, it } from "vitest";
import {
  assertRunnableEmailAdapter,
  normalizeSmtpEmailAdapterConfig,
  redactEmailAdapter,
} from "./adapter";

describe("normalizeSmtpEmailAdapterConfig", () => {
  it("normalizes SMTP values", () => {
    expect(
      normalizeSmtpEmailAdapterConfig({
        host: " smtp.example.com ",
        port: 587,
        secure: false,
        user: " user@example.com ",
        password: " secret ",
        fromEmail: " noreply@example.com ",
        fromName: " Ops ",
      }),
    ).toEqual({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      user: "user@example.com",
      password: "secret",
      fromEmail: "noreply@example.com",
      fromName: "Ops",
    });
  });

  it("defaults absent values", () => {
    expect(normalizeSmtpEmailAdapterConfig({})).toEqual({
      host: "",
      port: 0,
      secure: false,
      user: "",
      password: "",
      fromEmail: "",
      fromName: undefined,
    });
  });
});

describe("redactEmailAdapter", () => {
  it("removes SMTP password from public adapter payloads", () => {
    expect(
      redactEmailAdapter({
        id: "adapter-1",
        name: "SMTP",
        type: "smtp",
        isActive: true,
        priority: 0,
        config: {
          host: "smtp.example.com",
          port: 465,
          secure: true,
          user: "user@example.com",
          password: "secret",
          fromEmail: "noreply@example.com",
        },
      }),
    ).toMatchObject({
      config: {
        host: "smtp.example.com",
        passwordConfigured: true,
      },
    });
  });

  it("returns empty config for logging adapters", () => {
    expect(
      redactEmailAdapter({
        id: "adapter-1",
        name: "Log",
        type: "logging",
        isActive: true,
        priority: 0,
        config: { ignored: true },
      }),
    ).toMatchObject({ config: {} });
  });
});

describe("assertRunnableEmailAdapter", () => {
  it("accepts logging and complete SMTP adapters", () => {
    expect(() => assertRunnableEmailAdapter({ type: "logging", config: {} })).not.toThrow();
    expect(() =>
      assertRunnableEmailAdapter({
        type: "smtp",
        config: {
          host: "smtp.example.com",
          port: 587,
          secure: false,
          user: "user@example.com",
          password: "secret",
          fromEmail: "noreply@example.com",
        },
      }),
    ).not.toThrow();
  });

  it("reports incomplete SMTP adapters", () => {
    expect(() =>
      assertRunnableEmailAdapter({
        type: "smtp",
        config: {
          host: "",
          port: 0,
          secure: false,
          user: "",
          password: "",
          fromEmail: "",
        },
      }),
    ).toThrow("host, port, user, password, fromEmail");
  });
});
