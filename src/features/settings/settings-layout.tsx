import type { ReactNode } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  NativeSelect,
  NumberInput,
  PasswordInput,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { AlertTriangle, Database, Globe2, Save, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import type { SettingsGroup, SettingsResponse, SettingDescriptor, SettingsWarning } from "@/lib/settings/descriptors";
import type { DraftValues, PatchValue } from "./settings-types";
import { buildOverviewUnits, groupStateColor, overviewStatusColor, severityColor } from "./settings-utils";

export function SettingsWarningsPanel({ warnings }: { warnings: SettingsWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <Stack gap="xs">
      {warnings.map((warning) => (
        <Alert key={warning.id} color={severityColor(warning.severity)} icon={<AlertTriangle size={18} aria-hidden="true" />} title={warning.severity}>
          {warning.message}
        </Alert>
      ))}
    </Stack>
  );
}

export function SystemStatusStrip({ settings }: { settings: SettingsResponse }) {
  const editableSettings = settings.groups.flatMap((group) => group.settings).filter((setting) => setting.editable);
  const missingSettings = editableSettings.filter((setting) => setting.state === "missing" || setting.state === "invalid");
  return (
    <ResponsiveGrid minWidth={180} gap="sm">
      <StatusCard icon={Database} label="Database" value={settings.environment.lastUpdatedAt ? "Connected" : "Pending"} />
      <StatusCard icon={ShieldCheck} label="Auth bootstrap" value={settings.security.authBootstrap.status} />
      <StatusCard icon={Settings} label="Operator settings" value={missingSettings.length === 0 ? "Ready" : "Needs attention"} />
      <StatusCard
        icon={Globe2}
        label="Site address"
        value={settings.environment.appBaseUrl ? "Configured" : "Not set"}
        detail={settings.environment.appBaseUrl ?? settings.environment.currentRequestOrigin ?? "No request origin"}
      />
    </ResponsiveGrid>
  );
}

export function ResponsiveGrid({ children, minWidth, gap }: { children: ReactNode; minWidth: number; gap: "xs" | "sm" | "md" }) {
  return (
    <Box
      style={{
        display: "grid",
        gap: `var(--mantine-spacing-${gap})`,
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minWidth}px), 1fr))`,
      }}
    >
      {children}
    </Box>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card>
      <Group gap="sm" align="flex-start">
        <Icon size={20} aria-hidden="true" />
        <Stack gap={2}>
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {label}
          </Text>
          <Text fw={700}>{value}</Text>
          {detail ? (
            <Text size="sm" c="dimmed">
              {detail}
            </Text>
          ) : null}
        </Stack>
      </Group>
    </Card>
  );
}

export function OverviewAttentionPanel({ settings }: { settings: SettingsResponse }) {
  const units = buildOverviewUnits(settings);
  const attentionUnits = units.filter((unit) => unit.status !== "Ready");
  const attentionCount = attentionUnits.length + settings.warnings.length;
  return (
    <Card>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Text fw={700}>Attention</Text>
          <Badge color={attentionCount > 0 ? "yellow" : "green"} variant="light">
            {attentionCount > 0 ? `${attentionCount} item${attentionCount === 1 ? "" : "s"}` : "clear"}
          </Badge>
        </Group>
        {attentionCount === 0 ? (
          <Text size="sm" c="dimmed">No setup blockers.</Text>
        ) : (
          <Table.ScrollContainer minWidth={620}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Area</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Note</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {attentionUnits.map((unit) => (
                  <Table.Tr key={unit.label}>
                    <Table.Td>{unit.label}</Table.Td>
                    <Table.Td>
                      <Badge color={overviewStatusColor(unit.status)} variant="light" size="xs">
                        {unit.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{unit.detail}</Table.Td>
                  </Table.Tr>
                ))}
                {settings.warnings.map((warning) => (
                  <Table.Tr key={warning.id}>
                    <Table.Td>Settings</Table.Td>
                    <Table.Td>
                      <Badge color={severityColor(warning.severity)} variant="light" size="xs">
                        {warning.severity}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{warning.message}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </Card>
  );
}

export function SignalFact({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text size="xs" tt="uppercase" fw={700} c="dimmed">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </Box>
  );
}

export function SettingsGroupCard({
  group,
  draft,
  saving,
  onDraftChange,
  onSave,
}: {
  group: SettingsGroup;
  draft: DraftValues;
  saving: boolean;
  onDraftChange: (key: string, value: PatchValue) => void;
  onSave: () => void;
}) {
  const visibleSettings = group.settings.filter((setting) => !setting.advanced);
  const editableSettings = visibleSettings.filter((setting) => setting.editable);
  return (
    <Card>
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Text fw={700}>{group.label}</Text>
        </Stack>
        <Badge color={groupStateColor(group.state)} variant="light">
          {group.state}
        </Badge>
      </Group>

      <Stack gap="md" mt="md">
        {visibleSettings.map((setting) => (
          <SettingEditor
            key={setting.key}
            setting={setting}
            draftValue={draft[setting.key]}
            onChange={(value) => onDraftChange(setting.key, value)}
          />
        ))}
      </Stack>

      {editableSettings.length > 0 ? (
        <Group justify="flex-end" mt="lg">
          <Button leftSection={<Save size={16} aria-hidden="true" />} loading={saving} onClick={onSave}>
            Save {group.label}
          </Button>
        </Group>
      ) : null}
    </Card>
  );
}

function SettingEditor({
  setting,
  draftValue,
  onChange,
}: {
  setting: SettingDescriptor;
  draftValue: PatchValue | undefined;
  onChange: (value: PatchValue) => void;
}) {
  const pendingClear = draftValue === null;
  const value = draftValue !== undefined && draftValue !== null ? draftValue : setting.secret ? "" : setting.value ?? "";

  return (
    <Box>
      <Group justify="space-between" gap="xs" align="flex-start">
        <Stack gap={4} maw={520}>
          <Group gap={6}>
            <Text fw={700}>{setting.label}</Text>
            <StateBadge setting={setting} />
          </Group>
          {!setting.editable ? (
            <Text size="sm" c={setting.state === "missing" ? "red.7" : "gray.8"}>
              {pendingClear ? "Will clear saved value" : setting.displayValue}
            </Text>
          ) : null}
        </Stack>
      </Group>

      {setting.editable ? (
        <Box mt="sm">
          {renderInput(setting, value, onChange)}
        </Box>
      ) : null}
      <Divider mt="md" />
    </Box>
  );
}

function renderInput(
  setting: SettingDescriptor,
  value: PatchValue,
  onChange: (value: PatchValue) => void,
) {
  if (setting.type === "boolean") {
    return (
      <Switch
        aria-label={setting.label}
        checked={Boolean(value)}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    );
  }
  if (setting.type === "number") {
    return (
      <NumberInput
        aria-label={setting.label}
        value={typeof value === "number" ? value : value === "" ? "" : Number(value)}
        allowDecimal={false}
        onChange={(nextValue) => onChange(typeof nextValue === "number" ? nextValue : String(nextValue))}
      />
    );
  }
  if (setting.type === "select") {
    return (
      <NativeSelect
        aria-label={setting.label}
        value={typeof value === "string" ? value : ""}
        data={setting.options?.map((option) => ({ value: option.value, label: option.label })) ?? []}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }
  if (setting.secret) {
    return (
      <PasswordInput
        label="Secret value"
        placeholder="Blank unsets on save"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }
  if (setting.type === "csv" || setting.key === "auth_trusted_origins") {
    return (
      <Textarea
        aria-label={setting.label}
        minRows={2}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }
  return (
    <TextInput
      aria-label={setting.label}
      value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function StateBadge({ setting }: { setting: SettingDescriptor }) {
  const colors = {
    configured: "green",
    missing: "red",
    disabled: "gray",
    invalid: "red",
  } satisfies Record<SettingDescriptor["state"], string>;
  return (
    <Badge color={colors[setting.state]} variant="light" size="xs">
      {setting.secret && setting.state === "configured" ? "secret configured" : setting.state}
    </Badge>
  );
}
