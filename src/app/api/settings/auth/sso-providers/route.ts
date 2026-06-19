import {
  createSsoProvider,
  deleteSsoProvider,
  listSsoProviders,
  redactSsoProvider,
  updateSsoProvider,
  validateSsoProviderInput,
  type SsoProviderInput,
  type SsoProviderPatch,
} from "@/lib/auth/sso-provider-repository";
import {
  authorizeSettingsRequest,
  databaseUrlResponse,
  loadSettingsResponse,
  parseOptionalJson,
  safeSettingsActionError,
} from "../../_shared";
import { ensureServiceSettingsRow } from "@/lib/settings/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await authorizeSettingsRequest(request);
  if (authorization) {
    return authorization;
  }
  const database = databaseUrlResponse();
  const row = await ensureServiceSettingsRow(database.databaseUrl);
  const baseUrl = row.auth_base_url ?? null;
  const providers = await listSsoProviders(database.databaseUrl);
  return Response.json({ providers: providers.map((provider) => redactSsoProvider(provider, baseUrl)) });
}

export async function POST(request: Request) {
  const authorization = await authorizeSettingsRequest(request);
  if (authorization) {
    return authorization;
  }
  const database = databaseUrlResponse();
  try {
    const input = await parseOptionalJson(request) as Partial<SsoProviderInput>;
    const issues = validateSsoProviderInput(input as SsoProviderInput, { requireSecret: true });
    if (issues.length > 0) {
      return Response.json({ error: "invalid_sso_provider", issues }, { status: 400 });
    }
    await createSsoProvider(database.databaseUrl, input as SsoProviderInput);
    return Response.json({ settings: await loadSettingsResponse(database.databaseUrl, request) });
  } catch (error) {
    return Response.json({ error: safeSettingsActionError(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeSettingsRequest(request);
  if (authorization) {
    return authorization;
  }
  const database = databaseUrlResponse();
  try {
    const input = await parseOptionalJson(request) as Partial<SsoProviderPatch>;
    if (!input.id) {
      return Response.json({ error: "invalid_sso_provider", issues: ["id is required"] }, { status: 400 });
    }
    const issues = validateSsoProviderInput(input as SsoProviderPatch, { requireSecret: false });
    if (issues.length > 0) {
      return Response.json({ error: "invalid_sso_provider", issues }, { status: 400 });
    }
    await updateSsoProvider(database.databaseUrl, input as SsoProviderPatch);
    return Response.json({ settings: await loadSettingsResponse(database.databaseUrl, request) });
  } catch (error) {
    return Response.json({ error: safeSettingsActionError(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeSettingsRequest(request);
  if (authorization) {
    return authorization;
  }
  const database = databaseUrlResponse();
  try {
    const input = await parseOptionalJson(request) as { id?: string };
    if (!input.id) {
      return Response.json({ error: "invalid_sso_provider", issues: ["id is required"] }, { status: 400 });
    }
    await deleteSsoProvider(database.databaseUrl, input.id);
    return Response.json({ settings: await loadSettingsResponse(database.databaseUrl, request) });
  } catch (error) {
    return Response.json({ error: safeSettingsActionError(error) }, { status: 400 });
  }
}
