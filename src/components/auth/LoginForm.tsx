"use client";

import { type FormEvent, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Divider,
  Image,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { LogIn } from "lucide-react";

export type LoginExternalProvider = {
  providerId: string;
  buttonLabel: string;
  logoUrl?: string | null;
};

export function LoginForm({
  redirectTo,
  loginLogoUrl = null,
  emailPasswordLoginEnabled = true,
  externalProviders = [],
  navigateTo = (url) => window.location.assign(url),
}: {
  redirectTo: string;
  loginLogoUrl?: string | null;
  emailPasswordLoginEnabled?: boolean;
  externalProviders?: LoginExternalProvider[];
  navigateTo?: (url: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [externalPending, setExternalPending] = useState(false);
  const hasExternalProviders = externalProviders.length > 0;
  const loginUnavailable = !emailPasswordLoginEnabled && !hasExternalProviders;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          callbackURL: redirectTo,
        }),
      });

      if (!response.ok) {
        setError("Unable to sign in with those credentials.");
        return;
      }

      navigateTo(redirectTo);
    } catch {
      setError("Authentication service is unavailable.");
    } finally {
      setPending(false);
    }
  }

  async function startExternalSignIn(externalProvider: LoginExternalProvider) {
    setExternalPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/sign-in/oauth2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: externalProvider.providerId,
          callbackURL: redirectTo,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };

      if (!response.ok || !payload.url) {
        setError(payload.error ?? "External sign-in is unavailable.");
        return;
      }

      navigateTo(payload.url);
    } catch {
      setError("External sign-in is unavailable.");
    } finally {
      setExternalPending(false);
    }
  }

  return (
    <Card maw={420} w="100%" shadow="sm">
      <Stack>
        <Stack gap={4} align={loginLogoUrl ? "center" : undefined}>
          {loginLogoUrl ? (
            <Image src={loginLogoUrl} alt="Sign in" fit="contain" h={64} maw={240} />
          ) : (
            <Title order={1} size="h2">
              Sign in
            </Title>
          )}
          <Text size="sm" c="dimmed" ta={loginLogoUrl ? "center" : undefined}>
            Use an administrator account to access the catalog dashboard.
          </Text>
        </Stack>

        {error ? (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        ) : null}

        {loginUnavailable ? (
          <Alert color="yellow" variant="light" title="No login method configured">
            Enable email/password login or configure at least one ready SSO provider.
          </Alert>
        ) : null}

        {hasExternalProviders ? (
          <>
            {externalProviders.map((externalProvider) => (
              <Button
                key={externalProvider.providerId}
                type="button"
                variant="light"
                loading={externalPending}
                leftSection={externalProvider.logoUrl ? <Image src={externalProvider.logoUrl} alt="" fit="contain" w={18} h={18} /> : <LogIn size={16} aria-hidden="true" />}
                onClick={() => void startExternalSignIn(externalProvider)}
              >
                {externalProvider.buttonLabel}
              </Button>
            ))}
            {emailPasswordLoginEnabled ? <Divider label="or" labelPosition="center" /> : null}
          </>
        ) : null}

        {emailPasswordLoginEnabled ? (
          <form onSubmit={submit}>
            <Stack>
              <TextInput
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                required
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
              <PasswordInput
                label="Password"
                autoComplete="current-password"
                value={password}
                required
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
              <Button type="submit" loading={pending} leftSection={<LogIn size={16} aria-hidden="true" />}>
                Sign in
              </Button>
            </Stack>
          </form>
        ) : null}
      </Stack>
    </Card>
  );
}
