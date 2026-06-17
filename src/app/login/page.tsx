import { Box, Center } from "@mantine/core";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = normalizeRedirect(params.redirect);

  return (
    <Box component="main" bg="gray.0" mih="100vh">
      <Center mih="100vh" p="md">
        <LoginForm redirectTo={redirectTo} />
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
