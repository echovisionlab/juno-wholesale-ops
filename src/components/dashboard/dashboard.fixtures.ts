import { Archive, CircleCheck, Database, MailSearch } from "lucide-react";
import type { CatalogOpsDashboardProps } from "./CatalogOpsDashboard";

export const dashboardFixture: CatalogOpsDashboardProps = {
  stats: [
    { label: "Mailbox", value: "state303@dsub.io", detail: "delegated Gmail access", icon: MailSearch },
    { label: "Source", value: "inventory@dsub.io", detail: "group-delivered catalog mail", icon: Archive },
    { label: "Deduping", value: "4 keys", detail: "message, RFC822, attachment, content", icon: CircleCheck },
    { label: "Storage", value: "raw XLSX", detail: "replayable attachment archive", icon: Database },
  ],
  pipeline: [
    {
      title: "Fetch",
      body: "Query Gmail for Juno XLSX messages delivered through inventory@dsub.io.",
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
};
