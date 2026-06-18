import { Box, Center } from "@mantine/core";
import { LoginForm } from "@/components/auth/LoginForm";
import { normalizeLoginLogoUrl } from "@/lib/auth/login-logo";
import { getDatabaseUrl } from "@/lib/env";
import { getServiceSettings } from "@/lib/settings/repository";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = normalizeRedirect(params.redirect);
  const loginLogoUrl = await loadLoginLogoUrl();

  return (
    <Box component="main" bg="gray.0" mih="100vh">
      <Center mih="100vh" p="md">
        <LoginForm redirectTo={redirectTo} loginLogoUrl={loginLogoUrl} />
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

async function loadLoginLogoUrl(): Promise<string | null> {
  try {
    const databaseUrl = getDatabaseUrl();
    const row = await getServiceSettings(databaseUrl);
    return normalizeLoginLogoUrl(row?.auth_login_logo_url);
  } catch {
    return null;
  }
}
