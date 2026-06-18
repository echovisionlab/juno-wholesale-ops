import { requireAdmin } from "@/lib/auth/admin";
import { getDatabaseUrl } from "@/lib/env";
import {
  createMailboxSource,
  deleteMailboxSource,
  listMailboxSources,
  redactMailboxSource,
  updateMailboxSource,
  type MailboxSourceInput,
  type MailboxSourcePatch,
} from "@/lib/ingest/mail-source";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  const sources = await listMailboxSources(getDatabaseUrl());
  return Response.json({ sources: sources.map(redactMailboxSource) });
}

export async function POST(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  try {
    const source = await createMailboxSource(getDatabaseUrl(), (await parseJson(request)) as MailboxSourceInput);
    return Response.json({ source: redactMailboxSource(source) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  try {
    const source = await updateMailboxSource(getDatabaseUrl(), (await parseJson(request)) as MailboxSourcePatch);
    if (!source) {
      return Response.json({ error: "mail_source_not_found" }, { status: 404 });
    }
    return Response.json({ source: redactMailboxSource(source) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  try {
    const deleted = await deleteMailboxSource(getDatabaseUrl(), readId(await parseJson(request)));
    if (!deleted) {
      return Response.json({ error: "mail_source_not_found" }, { status: 404 });
    }
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function readId(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.trim()
  ) {
    return value.id;
  }
  throw new Error("Mail source id is required");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid mail source request";
}
