"use client";

import { useState } from "react";
import {
  ActionIcon,
  Button,
  Card,
  Divider,
  Group,
  MultiSelect,
  NativeSelect,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { Plus, Trash2 } from "lucide-react";
import {
  dashboardDateRanges,
  dashboardSignalSeverities,
  dashboardSignalTypes,
  defaultDashboardSignalFilters,
  formatDashboardDateRange,
  type DashboardSignalFilters,
  type DashboardSignalSeverity,
  type DashboardSignalType,
} from "@/lib/dashboard/signal-filters";
import {
  formatSignalSeverity as formatSeverity,
  formatSignalType,
} from "@/lib/dashboard/presentation";
import type { DashboardSavedView, DashboardSavedViewDraft } from "./types";

type DashboardSignalFiltersPanelProps = {
  filters: DashboardSignalFilters;
  filtersActive: boolean;
  savedViews: DashboardSavedView[];
  pending: boolean;
  onChange: (filters: DashboardSignalFilters) => void;
  onCreate?: (draft: DashboardSavedViewDraft) => void;
  onUpdate?: (view: DashboardSavedView, filters: DashboardSignalFilters) => void;
  onDelete?: (view: DashboardSavedView) => void;
};

export function DashboardSignalFiltersPanel({
  filters,
  filtersActive,
  savedViews,
  pending,
  onChange,
  onCreate,
  onUpdate,
  onDelete,
}: DashboardSignalFiltersPanelProps) {
  const [selectedViewId, setSelectedViewId] = useState("");
  const [name, setName] = useState("");
  const selectedView = savedViews.find((view) => view.id === selectedViewId) ?? null;
  const canCreate = Boolean(name.trim()) && Boolean(onCreate) && !pending;
  const canUpdate = Boolean(selectedView) && Boolean(onUpdate) && !pending;
  const canDelete = Boolean(selectedView) && Boolean(onDelete) && !pending;

  function applySavedView(viewId: string | null) {
    const nextView = savedViews.find((view) => view.id === viewId) ?? null;
    if (!nextView) {
      setSelectedViewId("");
      return;
    }
    setSelectedViewId(nextView.id);
    onChange(nextView.filters);
    setName(nextView.name);
  }

  function updateFilters(patch: Partial<DashboardSignalFilters>) {
    onChange({ ...filters, ...patch });
  }

  return (
    <Card>
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
          <MultiSelect
            label="Signal type"
            aria-label="Signal type"
            data={dashboardSignalTypes.map((type) => ({ value: type, label: formatSignalType(type) }))}
            value={filters.signalTypes}
            onChange={(value) => updateFilters({ signalTypes: value as DashboardSignalType[] })}
            clearable
          />
          <MultiSelect
            label="Severity"
            aria-label="Severity"
            data={dashboardSignalSeverities.map((severity) => ({ value: severity, label: formatSeverity(severity) }))}
            value={filters.severities}
            onChange={(value) => updateFilters({ severities: value as DashboardSignalSeverity[] })}
            clearable
          />
          <NativeSelect
            label="Date range"
            aria-label="Signal date range"
            value={filters.dateRange}
            data={dashboardDateRanges.map((range) => ({ value: range, label: formatDashboardDateRange(range) }))}
            onChange={(event) => updateFilters({ dateRange: event.currentTarget.value as DashboardSignalFilters["dateRange"] })}
          />
        </SimpleGrid>

        <Group gap="lg">
          <Switch
            label="Watch hits"
            aria-label="Watch hits"
            checked={filters.watchHitsOnly}
            onChange={(event) => updateFilters({ watchHitsOnly: event.currentTarget.checked })}
          />
          <Switch
            label="Low stock"
            aria-label="Low stock"
            checked={filters.lowStockOnly}
            onChange={(event) => updateFilters({ lowStockOnly: event.currentTarget.checked })}
          />
          <Switch
            label="Movement"
            aria-label="Movement"
            checked={filters.movementOnly}
            onChange={(event) => updateFilters({ movementOnly: event.currentTarget.checked })}
          />
          <Button variant="light" disabled={!filtersActive} onClick={() => onChange(defaultDashboardSignalFilters)}>
            Reset
          </Button>
        </Group>

        <Divider />

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
          <Select
            label="Saved view"
            aria-label="Saved view"
            placeholder="Select saved view"
            data={savedViews.map((view) => ({ value: view.id, label: view.name }))}
            value={selectedViewId || null}
            onChange={applySavedView}
            clearable
            clearButtonProps={{ "aria-label": "Clear saved view" }}
          />
          <TextInput
            label="View name"
            placeholder="Ops review"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Group align="flex-end" gap="xs">
            <Button
              leftSection={<Plus size={16} aria-hidden="true" />}
              disabled={!canCreate}
              loading={pending}
              onClick={() => {
                onCreate?.({ name: name.trim(), filters });
              }}
            >
              Save
            </Button>
            <Button variant="light" disabled={!canUpdate} loading={pending} onClick={() => selectedView && onUpdate?.(selectedView, filters)}>
              Update
            </Button>
            <Tooltip label="Delete saved view">
              <ActionIcon
                aria-label="Delete saved view"
                color="red"
                variant="light"
                disabled={!canDelete}
                loading={pending}
                onClick={() => selectedView && onDelete?.(selectedView)}
              >
                <Trash2 size={16} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
          </Group>
        </SimpleGrid>
      </Stack>
    </Card>
  );
}
