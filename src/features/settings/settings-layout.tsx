import type { ReactNode } from "react";
import {
  Alert,
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
import { AlertTriangle, Save } from "lucide-react";
import type { SettingsGroup, SettingsResponse, SettingDescriptor, SettingsWarning } from "@/lib/settings/descriptors";
import type { DraftValues, PatchValue } from "./settings-types";
import { severityColor } from "./settings-utils";

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

export function OverviewAttentionPanel({ settings }: { settings: SettingsResponse }) {
  const attentionRows = buildAttentionRows(settings);
  const attentionCount = attentionRows.length + settings.warnings.length;
  return (
    <Card>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Text fw={700}>Attention</Text>
          <Text size="sm" c="dimmed">
            {attentionCount > 0 ? `${attentionCount} item${attentionCount === 1 ? "" : "s"}` : "Clear"}
          </Text>
        </Group>
        {attentionCount === 0 ? (
          <Text size="sm" c="dimmed">No setup blockers.</Text>
        ) : (
          <Table.ScrollContainer minWidth={620}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Area</Table.Th>
                  <Table.Th>Note</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {attentionRows.map((row) => (
                  <Table.Tr key={row.label}>
                    <Table.Td>{row.label}</Table.Td>
                    <Table.Td>{row.note}</Table.Td>
                  </Table.Tr>
                ))}
                {settings.warnings.map((warning) => (
                  <Table.Tr key={warning.id}>
                    <Table.Td>Settings</Table.Td>
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

function buildAttentionRows(settings: SettingsResponse): Array<{ label: string; note: string }> {
  const rows: Array<{ label: string; note: string }> = [];
  const authGroup = settings.groups.find((group) => group.id === "auth");
  if (settings.security.authBootstrap.status !== "ready" || authGroup?.state === "missing" || authGroup?.state === "warning") {
    rows.push({ label: "Auth & Admin Access", note: "Review Auth tab." });
  }
  if (settings.units.mail.status !== "ready") {
    rows.push({ label: "Mail Ingest", note: settings.units.mail.detail });
  }
  if (settings.units.junoLive.status !== "ready" && settings.units.junoLive.status !== "disabled") {
    rows.push({ label: "Juno Live", note: settings.units.junoLive.detail });
  }
  if (settings.units.notifications.status !== "ready") {
    rows.push({ label: "Notifications", note: settings.units.notifications.detail });
  }
  return rows;
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
      <Text fw={700}>{group.label}</Text>

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
          <Text fw={700}>{setting.label}</Text>
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
