import { describe, expect, it } from "vitest";
import {
  assertMailProviderImplemented,
  getMailProviderDescriptor,
  getMailProviderLabel,
  GMAIL_WORKSPACE_READONLY_SCOPE,
  isMailProviderImplemented,
  mailProviderRegistry,
} from "./mail-provider-registry";

describe("mail provider registry", () => {
  it("describes implemented and planned mail providers", () => {
    expect(mailProviderRegistry.map((provider) => provider.provider)).toEqual([
      "gmail",
      "imap",
      "microsoft_graph",
      "generic",
    ]);
    expect(getMailProviderDescriptor("gmail")).toMatchObject({
      label: "Gmail Workspace",
      implemented: true,
      authType: "google_workspace_delegation",
      credentialType: "google_service_account_json",
      fixedScopes: GMAIL_WORKSPACE_READONLY_SCOPE,
    });
    expect(getMailProviderLabel("microsoft_graph")).toBe("Microsoft Graph");
    expect(isMailProviderImplemented("gmail")).toBe(true);
    expect(isMailProviderImplemented("generic")).toBe(false);
    expect(() => assertMailProviderImplemented("gmail")).not.toThrow();
    expect(() => assertMailProviderImplemented("imap")).toThrow("IMAP mail source adapter is not implemented");
  });
});
