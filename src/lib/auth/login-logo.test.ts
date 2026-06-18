import { describe, expect, it } from "vitest";
import { isSupportedLoginLogoUrl, normalizeLoginLogoUrl } from "./login-logo";

describe("login logo URL helpers", () => {
  it("accepts http(s) png, webp, and svg assets", () => {
    expect(normalizeLoginLogoUrl(" https://assets.example.test/logo.png ")).toBe("https://assets.example.test/logo.png");
    expect(isSupportedLoginLogoUrl("https://assets.example.test/logo.webp?version=1")).toBe(true);
    expect(isSupportedLoginLogoUrl("http://localhost:3006/logo.svg#mark")).toBe(true);
  });

  it("rejects empty, non-http, and unsupported logo URLs", () => {
    expect(normalizeLoginLogoUrl(null)).toBeNull();
    expect(normalizeLoginLogoUrl("")).toBeNull();
    expect(isSupportedLoginLogoUrl("/logo.svg")).toBe(false);
    expect(isSupportedLoginLogoUrl("file:///tmp/logo.svg")).toBe(false);
    expect(isSupportedLoginLogoUrl("https://assets.example.test/logo.jpg")).toBe(false);
    expect(isSupportedLoginLogoUrl("not-a-url")).toBe(false);
  });
});
