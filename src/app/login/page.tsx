import { Box, Center } from "@mantine/core";
import { LoginForm, type LoginExternalProvider } from "@/components/auth/LoginForm";
import { normalizeLoginLogoUrl } from "@/lib/auth/login-logo";
import { listSsoProviders } from "@/lib/auth/sso-provider-repository";
import { isExternalAuthProviderReady, resolveAppAuthSettings } from "@/lib/auth/settings";
import { getDatabaseUrl, loadRuntimeEnv } from "@/lib/env";
import { getServiceSettings } from "@/lib/settings/repository";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = normalizeRedirect(params.redirect);
  const loginSettings = await loadLoginSettings();

  return (
    <Box component="main" bg="gray.0" mih="100vh">
      <Center mih="100vh" p="md">
        <LoginForm
          redirectTo={redirectTo}
          loginLogoUrl={loginSettings.loginLogoUrl}
          emailPasswordLoginEnabled={loginSettings.emailPasswordLoginEnabled}
          externalProviders={loginSettings.externalProviders}
        />
      </Center>
    </Box>
  );
}

function normalizeRedirect(value: string | undefined): string {
  if (!value) {
    return "/";
  }

  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value.startsWith("/") ? value : "/";
  }
}

async function loadLoginSettings(): Promise<{
  loginLogoUrl: string | null;
  emailPasswordLoginEnabled: boolean;
  externalProviders: LoginExternalProvider[];
}> {
  try {
    const databaseUrl = getDatabaseUrl();
    const env = loadRuntimeEnv(process.env);
    const row = await getServiceSettings(databaseUrl);
    const providers = await listSsoProviders(databaseUrl);
    const settings = resolveAppAuthSettings(env, row, { ssoProviders: providers, rawEnv: process.env });
    return {
      loginLogoUrl: normalizeLoginLogoUrl(row?.auth_login_logo_url),
      emailPasswordLoginEnabled: settings.emailPasswordLoginEnabled,
      externalProviders: settings.externalProviders
        .filter(isExternalAuthProviderReady)
        .map((provider) => ({
          providerId: provider.providerId,
          buttonLabel: provider.buttonLabel,
          logoUrl: provider.logoUrl ?? null,
        })),
    };
  } catch {
    return { loginLogoUrl: null, emailPasswordLoginEnabled: true, externalProviders: [] };
  }
}
