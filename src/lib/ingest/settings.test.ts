import { describe, expect, it } from "vitest";
import { loadRuntimeEnv } from "@/lib/env";
import {
  assertRunnableGmailIngestSettings,
  getMissingGmailIngestSettings,
  resolveGmailIngestSettings,
  type GmailIngestServiceSettingsRow,
} from "./settings";

describe("resolveGmailIngestSettings", () => {
  it("uses env values when the settings row is empty", () => {
    const env = loadRuntimeEnv({
      GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
      GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/run/secrets/google.json",
      GMAIL_INGEST_QUERY: "from:supplier@example.com filename:xlsx",
    });

    expect(resolveGmailIngestSettings(env, emptyRow())).toMatchObject({
      delegatedUser: "operator@example.com",
      serviceAccountKeyJson: "/run/secrets/google.json",
      scopes: "https://www.googleapis.com/auth/gmail.modify",
      query: "from:supplier@example.com filename:xlsx",
      maxResults: 25,
      lookbackMs: 604800000,
      processedLabel: "Wholesale Processed",
      storageDir: ".data/mail-attachments",
      attachmentPattern: "New Preorders|New Releases In Stock",
      supplierCode: "juno",
    });
  });

  it("lets database settings override env values", () => {
    const env = loadRuntimeEnv({
      GOOGLE_WORKSPACE_DELEGATED_USER: "env@example.com",
      GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/env/google.json",
    });

    expect(
      resolveGmailIngestSettings(env, {
        ...emptyRow(),
        google_workspace_delegated_user: "db@example.com",
        google_service_account_key_json: "/db/google.json",
        google_gmail_scopes: "scope-a scope-b",
        gmail_ingest_query: "subject:Juno",
        gmail_max_results: 50,
        gmail_ingest_lookback_ms: 86400000,
        gmail_processed_label: "Done",
        gmail_storage_dir: "/archive",
        catalog_attachment_pattern: "Daily",
        supplier_code: "supplier",
      }),
    ).toMatchObject({
      delegatedUser: "db@example.com",
      serviceAccountKeyJson: "/db/google.json",
      scopes: "scope-a scope-b",
      query: "subject:Juno",
      maxResults: 50,
      lookbackMs: 86400000,
      processedLabel: "Done",
      storageDir: "/archive",
      attachmentPattern: "Daily",
      supplierCode: "supplier",
    });
  });

  it("reports and throws for missing runtime settings", () => {
    const settings = resolveGmailIngestSettings(loadRuntimeEnv({}), null);

    expect(getMissingGmailIngestSettings(settings)).toEqual([
      "google_workspace_delegated_user",
      "google_service_account_key_json",
    ]);
    expect(() => assertRunnableGmailIngestSettings(settings)).toThrow(
      "google_workspace_delegated_user, google_service_account_key_json",
    );
  });

  it("accepts complete runnable settings", () => {
    const settings = resolveGmailIngestSettings(
      loadRuntimeEnv({
        GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/run/secrets/google.json",
      }),
      null,
    );

    expect(getMissingGmailIngestSettings(settings)).toEqual([]);
    expect(() => assertRunnableGmailIngestSettings(settings)).not.toThrow();
  });
});

function emptyRow(): GmailIngestServiceSettingsRow {
  return {
    google_workspace_delegated_user: null,
    google_service_account_key_json: null,
    google_gmail_scopes: null,
    gmail_ingest_query: null,
    gmail_max_results: null,
    gmail_ingest_lookback_ms: null,
    gmail_processed_label: null,
    gmail_storage_dir: null,
    catalog_attachment_pattern: null,
    supplier_code: null,
  };
}
