"use client";

import { Badge, Card, Group, Text } from "@mantine/core";
import type { PipelineItem } from "./types";

export function PipelineCard({ title, body, status }: PipelineItem) {
  return (
    <Card component="article">
      <Group justify="space-between" align="flex-start">
        <Text fw={600}>{title}</Text>
        <Badge color="sage" variant="light">
          {status}
        </Badge>
      </Group>
      <Text mt="md" size="sm" c="dimmed">
        {body}
      </Text>
    </Card>
  );
}
