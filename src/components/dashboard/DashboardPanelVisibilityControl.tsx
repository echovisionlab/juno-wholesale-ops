"use client";

import { Box, Button, Checkbox, Group, Menu, Stack, Text } from "@mantine/core";
import { SlidersHorizontal } from "lucide-react";
import {
  getVisibleOptionalDashboardPanelIds,
  optionalDashboardPanelDefinitions,
  type DashboardPanelId,
  type DashboardPanelLayout,
} from "@/lib/dashboard/panel-layout";

type DashboardPanelVisibilityControlProps = {
  layout: DashboardPanelLayout;
  onChange: (panelIds: DashboardPanelId[]) => void;
};

export function DashboardPanelVisibilityControl({ layout, onChange }: DashboardPanelVisibilityControlProps) {
  const visiblePanelIds = getVisibleOptionalDashboardPanelIds(layout);
  const hiddenCount = optionalDashboardPanelDefinitions.length - visiblePanelIds.length;

  function togglePanel(panelId: DashboardPanelId, checked: boolean) {
    const nextPanelIds = checked
      ? [...visiblePanelIds, panelId]
      : visiblePanelIds.filter((visiblePanelId) => visiblePanelId !== panelId);
    onChange(nextPanelIds);
  }

  return (
    <Menu position="bottom-end" closeOnItemClick={false} withinPortal>
      <Menu.Target>
        <Button variant="default" size="sm" leftSection={<SlidersHorizontal size={16} aria-hidden="true" />}>
          {hiddenCount > 0 ? `Panels (${hiddenCount} hidden)` : "Panels"}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Box p="sm" miw={240} mah={360} style={{ overflowY: "auto" }}>
          <Stack gap="sm">
            <Group justify="space-between" gap="sm">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                Visible panels
              </Text>
              <Button
                size="compact-xs"
                variant="subtle"
                disabled={hiddenCount === 0}
                onClick={() => onChange(optionalDashboardPanelDefinitions.map((definition) => definition.id))}
              >
                Show all
              </Button>
            </Group>
            {optionalDashboardPanelDefinitions.map((definition) => (
              <Checkbox
                key={definition.id}
                size="sm"
                label={definition.label}
                aria-label={definition.label}
                checked={visiblePanelIds.includes(definition.id)}
                onChange={(event) => togglePanel(definition.id, event.currentTarget.checked)}
              />
            ))}
          </Stack>
        </Box>
      </Menu.Dropdown>
    </Menu>
  );
}
