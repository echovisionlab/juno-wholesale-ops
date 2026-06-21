"use client";

import { Card, Group, Text } from "@mantine/core";
import type { PipelineItem } from "./types";

export function PipelineCard({ title, body, status }: PipelineItem) {
  return (
    <Card component="article">
      <Group justify="space-between" align="flex-start">
        <Text fw={600}>{title}</Text>
        <Text size="sm" c="dimmed">
          {status}
        </Text>
      </Group>
      <Text mt="md" size="sm" c="dimmed">
        {body}
      </Text>
    </Card>
  );
}
