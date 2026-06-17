"use client";

import { Group, ThemeIcon, Title } from "@mantine/core";
import type { PropsWithChildren } from "react";
import type { DashboardIcon } from "./types";

export function SectionHeader({
  icon: Icon,
  children,
}: PropsWithChildren<{ icon: DashboardIcon }>) {
  return (
    <Group gap="xs" mb="sm">
      <ThemeIcon color="sage" variant="light">
        <Icon size={18} aria-hidden="true" />
      </ThemeIcon>
      <Title order={2} size="h4">
        {children}
      </Title>
    </Group>
  );
}
