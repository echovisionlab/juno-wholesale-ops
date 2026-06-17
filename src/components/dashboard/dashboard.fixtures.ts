import { Archive, CircleCheck, Database, MailSearch } from "lucide-react";
import type { CatalogOpsDashboardProps } from "./CatalogOpsDashboard";

export const dashboardFixture: CatalogOpsDashboardProps = {
  stats: [
    { label: "Mailbox", value: "Configurable", detail: "delegated Gmail access", icon: MailSearch },
    { label: "Source", value: "Gmail query", detail: "catalog mail search expression", icon: Archive },
    { label: "Deduping", value: "4 keys", detail: "message, RFC822, attachment, content", icon: CircleCheck },
    { label: "Storage", value: "raw XLSX", detail: "replayable attachment archive", icon: Database },
  ],
  pipeline: [
    {
      title: "Fetch",
      body: "Query Gmail for Juno XLSX messages using configured workspace settings.",
      status: "Ready",
    },
    {
      title: "Normalize",
      body: "Extract source fields, pricing, stock, release dates, and deterministic hashes.",
      status: "Ready",
    },
    {
      title: "Persist",
      body: "Store source mail, attachment hash, catalog snapshot, and raw item rows in Postgres.",
      status: "Migration added",
    },
    {
      title: "Live lookup",
      body: "Queue selected Juno IDs for read-only browser stock checks through a managed background process.",
      status: "Managed",
    },
  ],
  commands: [
    "pnpm gmail:smoke",
    "pnpm gmail:ingest",
    "pnpm gmail:ingest:write",
    "pnpm juno:live:enqueue",
    "pnpm juno:live:worker",
  ],
  setupStatus: {
    ready: false,
    steps: [
      {
        id: "database",
        label: "Database",
        state: "complete",
        detail: "required for persistence and worker state",
        action: null,
        missing: [],
        settings: [
          {
            key: "DATABASE_URL",
            label: "Postgres connection",
            source: "runtime",
            state: "configured",
            value: "configured",
            secret: true,
          },
        ],
        guardrails: [
          {
            label: "Service settings row",
            state: "ok",
            detail: "Database overrides can be applied through the singleton service_setting row.",
          },
        ],
      },
      {
        id: "gmail",
        label: "Gmail ingest",
        state: "missing",
        detail: "required for catalog email ingestion",
        action: "Configure the delegated mailbox, service account key, query, storage, and supplier defaults.",
        missing: ["google_workspace_delegated_user", "google_service_account_key_json"],
        settings: [
          {
            key: "google_workspace_delegated_user",
            label: "Delegated mailbox",
            source: "unset",
            state: "missing",
            value: "not set",
          },
          {
            key: "gmail_ingest_query",
            label: "Search query",
            source: "runtime",
            state: "configured",
            value: "has:attachment filename:xlsx newer_than:30d",
          },
        ],
        guardrails: [
          {
            label: "Cursored Gmail search",
            state: "ok",
            detail: "Ingest can use stored cursor state and content hashes to avoid duplicate sheets.",
          },
        ],
      },
      {
        id: "juno",
        label: "Live stock lookup",
        state: "missing",
        detail: "required for browser-based stock checks",
        action: "Configure credentials and keep delay bounds sane before starting the worker.",
        missing: ["juno_login_email", "juno_login_password"],
        settings: [
          {
            key: "juno_login_email",
            label: "Login email",
            source: "unset",
            state: "missing",
            value: "not set",
          },
          {
            key: "juno_live_poll_interval_ms",
            label: "Automatic lookup interval",
            source: "unset",
            state: "disabled",
            value: "manual only",
          },
        ],
        guardrails: [
          {
            label: "Scheduled polling",
            state: "warning",
            detail: "No polling interval is set; lookups stay manual.",
          },
        ],
      },
      {
        id: "auth",
        label: "Admin auth",
        state: "disabled",
        detail: "Better Auth admin gate is disabled",
        action: "Enable AUTH_ENABLED or auth_enabled when this service is exposed beyond trusted local access.",
        missing: [],
        settings: [
          {
            key: "auth_enabled",
            label: "Admin gate",
            source: "runtime",
            state: "configured",
            value: "disabled",
          },
        ],
        guardrails: [
          {
            label: "Protected access",
            state: "warning",
            detail: "Requests are not gated by Better Auth while this setting is disabled.",
          },
        ],
      },
    ],
  },
};
