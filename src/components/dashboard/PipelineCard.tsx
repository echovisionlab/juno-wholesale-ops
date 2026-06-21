"use client";

import { Card, Text } from "@mantine/core";
import type { PipelineItem } from "./types";

export function PipelineCard({ title, body }: PipelineItem) {
  return (
    <Card component="article">
      <Text fw={600}>{title}</Text>
      <Text mt="md" size="sm" c="dimmed">
        {body}
      </Text>
    </Card>
  );
}
