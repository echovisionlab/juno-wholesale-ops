import { Box, Center } from "@mantine/core";
import { LoginForm, type LoginExternalProvider } from "@/components/auth/LoginForm";
import { normalizeLoginLogoUrl } from "@/lib/auth/login-logo";
import { resolveAppAuthSettings } from "@/lib/auth/settings";
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
          externalProvider={loginSettings.externalProvider}
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
  externalProvider: LoginExternalProvider | null;
}> {
  try {
    const databaseUrl = getDatabaseUrl();
    const env = loadRuntimeEnv(process.env);
    const row = await getServiceSettings(databaseUrl);
    const settings = resolveAppAuthSettings(env, row);
    const provider = settings.externalProvider;
    return {
      loginLogoUrl: normalizeLoginLogoUrl(row?.auth_login_logo_url),
      externalProvider: provider && isLoginExternalProviderReady(settings)
        ? {
            providerId: provider.providerId,
            buttonLabel: provider.buttonLabel,
            logoUrl: provider.logoUrl ?? null,
          }
        : null,
    };
  } catch {
    return { loginLogoUrl: null, externalProvider: null };
  }
}

function isLoginExternalProviderReady(settings: ReturnType<typeof resolveAppAuthSettings>): boolean {
  const provider = settings.externalProvider;
  return Boolean(
    settings.externalProviderEnabled &&
    settings.baseUrl &&
    provider?.providerId &&
    provider.discoveryUrl &&
    provider.clientId &&
    provider.clientSecret,
  );
}
