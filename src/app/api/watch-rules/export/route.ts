import { requireAdmin } from "@/lib/auth/admin";
import { getDatabaseUrl } from "@/lib/env";
import { listWatchRules } from "@/lib/insights/repository";
import { buildWatchRuleExportPayload } from "@/lib/insights/watch-rule-transfer";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  const rules = await listWatchRules(getDatabaseUrl());
  return Response.json({ payload: buildWatchRuleExportPayload(rules) });
}
