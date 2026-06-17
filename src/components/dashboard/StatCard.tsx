"use client";

import { Card, Group, Text, ThemeIcon } from "@mantine/core";
import type { StatCardData } from "./types";

export function StatCard({ label, value, detail, icon: Icon }: StatCardData) {
  return (
    <Card>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {label}
        </Text>
        <ThemeIcon color="sage" variant="light" size="sm">
          <Icon size={16} aria-hidden="true" />
        </ThemeIcon>
      </Group>
      <Text mt="md" size="xl" fw={700}>
        {value}
      </Text>
      <Text mt={4} size="sm" c="dimmed">
        {detail}
      </Text>
    </Card>
  );
}
