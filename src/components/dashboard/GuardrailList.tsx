"use client";

import { Card, Group, List, Text, ThemeIcon } from "@mantine/core";
import { TriangleAlert } from "lucide-react";

export function GuardrailList({ items }: { items: string[] }) {
  return (
    <Card>
      <Group gap="xs">
        <ThemeIcon color="yellow" variant="light" size="sm">
          <TriangleAlert size={16} aria-hidden="true" />
        </ThemeIcon>
        <Text fw={700}>Current Guardrails</Text>
      </Group>
      <List mt="md" spacing="sm" size="sm" c="dimmed">
        {items.map((item) => (
          <List.Item key={item}>{item}</List.Item>
        ))}
      </List>
    </Card>
  );
}
