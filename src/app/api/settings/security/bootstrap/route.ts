import {
  authorizeSettingsRequest,
  databaseUrlResponse,
  loadSettingsResponse,
} from "@/app/api/settings/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await authorizeSettingsRequest(request);
  if (authorization) {
    return authorization;
  }

  const database = databaseUrlResponse();

  const settings = await loadSettingsResponse(database.databaseUrl, request);
  return Response.json(settings.security.authBootstrap);
}
