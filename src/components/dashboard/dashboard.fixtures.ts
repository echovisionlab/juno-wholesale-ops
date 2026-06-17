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
        missing: [],
      },
      {
        id: "gmail",
        label: "Gmail ingest",
        state: "missing",
        detail: "required for catalog email ingestion",
        missing: ["google_workspace_delegated_user", "google_service_account_key_json"],
      },
      {
        id: "juno",
        label: "Juno account",
        state: "missing",
        detail: "required for live stock lookup",
        missing: ["juno_login_email", "juno_login_password"],
      },
      {
        id: "auth",
        label: "Admin auth",
        state: "disabled",
        detail: "external admin gate disabled",
        missing: [],
      },
    ],
  },
};
