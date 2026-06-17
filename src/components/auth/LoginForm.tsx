"use client";

import { type FormEvent, useState } from "react";
import {
  Alert,
  Button,
  Card,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { LogIn } from "lucide-react";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

      window.location.assign(redirectTo);
    } catch {
      setError("Authentication service is unavailable.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card maw={420} w="100%" shadow="sm">
      <form onSubmit={submit}>
        <Stack>
          <Stack gap={4}>
            <Title order={1} size="h2">
              Admin sign in
            </Title>
            <Text size="sm" c="dimmed">
              Use an administrator account to access the catalog dashboard.
            </Text>
          </Stack>

          {error ? (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          ) : null}

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
    </Card>
  );
}
