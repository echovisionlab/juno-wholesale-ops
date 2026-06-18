"use client";

import { Card, Code, Stack, Text } from "@mantine/core";

export function CommandPanel({ commands }: { commands: string[] }) {
  return (
    <Card bg="dark.9" c="white" withBorder={false}>
      <Stack gap="md">
        <Text fw={700}>Next Actions</Text>
        <Code block c="sage.0" bg="dark.7">
          {commands.join("\n")}
        </Code>
      </Stack>
    </Card>
  );
}
