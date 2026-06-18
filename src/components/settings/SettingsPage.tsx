"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Container,
  Divider,
  Group,
  NativeSelect,
  NumberInput,
  PasswordInput,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Database,
  Globe2,
  MailSearch,
  RotateCw,
  Save,
  Settings,
  ShieldCheck,
} from "lucide-react";
import type {
  SettingsGroup,
  SettingsGroupId,
  SettingsResponse,
  SettingDescriptor,
  SettingsWarning,
} from "@/lib/settings/descriptors";

type PatchValue = string | number | boolean | null;
type DraftValues = Record<string, PatchValue>;
type ActionResult = Record<string, unknown>;

type SettingsPageProps = {
  initialSettings?: SettingsResponse | null;
  initialError?: string | null;
};

export function SettingsPage({ initialSettings = null, initialError = null }: SettingsPageProps) {
  const [settings, setSettings] = useState<SettingsResponse | null>(initialSettings);
  const [draft, setDraft] = useState<DraftValues>({});
  const [error, setError] = useState<string | null>(initialError);
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const shouldLoadOnClient = !initialSettings && !initialError;

  const loadSettings = useCallback(async () => {
    setError(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/settings", { signal: controller.signal });
      const payload = (await response.json().catch(() => ({}))) as SettingsResponse & { error?: string };
      if (!response.ok) {
        setError(payload.error ?? `Settings API returned ${response.status}`);
        return;
      }
      setSettings(payload);
      setDraft({});
    } catch (loadError: unknown) {
      setError(loadError instanceof Error && loadError.name === "AbortError"
        ? "Settings API timed out. Check DATABASE_URL and the local Postgres container, then retry."
        : loadError instanceof Error ? loadError.message : "Settings API unavailable");
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    if (shouldLoadOnClient) {
      void Promise.resolve().then(() => loadSettings());
    }
  }, [loadSettings, shouldLoadOnClient]);

  async function saveGroup(group: SettingsGroup) {
    const groupPatch = Object.fromEntries(
      group.settings
        .filter((setting) => setting.editable && Object.prototype.hasOwnProperty.call(draft, setting.key))
        .map((setting) => [setting.key, draft[setting.key]]),
    );
    if (Object.keys(groupPatch).length === 0) {
      return;
    }

    setSavingGroup(group.id);
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [group.id]: groupPatch }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        settings?: SettingsResponse;
        error?: string;
        issues?: string[];
      };
      if (!response.ok || !payload.settings) {
        setError(payload.issues?.join(" ") ?? payload.error ?? `Settings save returned ${response.status}`);
        return;
      }
      setSettings(payload.settings);
      setDraft((current) => {
        const next = { ...current };
        for (const key of Object.keys(groupPatch)) {
          delete next[key];
        }
        return next;
      });
    } finally {
      setSavingGroup(null);
    }
  }

  async function clearSetting(group: SettingsGroup, setting: SettingDescriptor) {
    setDraft((current) => ({ ...current, [setting.key]: null }));
    await savePatch(group.id, { [setting.key]: null });
  }

  async function savePatch(groupId: SettingsGroupId, patch: Record<string, PatchValue>) {
    setSavingGroup(groupId);
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [groupId]: patch }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        settings?: SettingsResponse;
        error?: string;
        issues?: string[];
      };
      if (!response.ok || !payload.settings) {
        setError(payload.issues?.join(" ") ?? payload.error ?? `Settings save returned ${response.status}`);
        return;
      }
      setSettings(payload.settings);
      setDraft((current) => {
        const next = { ...current };
        for (const key of Object.keys(patch)) {
          delete next[key];
        }
        return next;
      });
    } finally {
      setSavingGroup(null);
    }
  }

  async function runAction(action: "test-gmail" | "test-juno-session" | "refresh-status" | "run-demo-seed") {
    setActionPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/settings/actions/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "smoke" }),
      });
      const payload = (await response.json().catch(() => ({}))) as ActionResult & {
        settings?: SettingsResponse;
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? `${action} returned ${response.status}`);
      }
      if (payload.settings) {
        setSettings(payload.settings);
      }
      setActionResult(maskActionResult(payload));
    } finally {
      setActionPending(null);
    }
  }

  const groupsById = useMemo(() => {
    return Object.fromEntries((settings?.groups ?? []).map((group) => [group.id, group])) as Partial<Record<SettingsGroupId, SettingsGroup>>;
  }, [settings]);

  return (
    <Box component="main" bg="gray.0" mih="100vh">
      <Container py="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Text size="sm" fw={700} tt="uppercase" c="sage.7">
                Operator setup
              </Text>
              <Title order={1}>Settings Center</Title>
              <Text c="dimmed">
                Read-only: no cart, no ordering, no checkout. Runtime env is fallback/bootstrap; saved operator settings live in the database row.
              </Text>
            </Stack>
            <Button component="a" href="/" variant="light">
              Dashboard
            </Button>
          </Group>

          {error ? (
            <Alert color="red" icon={<AlertTriangle size={18} aria-hidden="true" />} title="Settings action failed">
              {error}
            </Alert>
          ) : null}

          {!settings ? (
            <Card>
              <Text fw={700}>{error ? "Settings unavailable" : "Loading settings..."}</Text>
              <Text size="sm" c="dimmed" mt={4}>
                {error
                  ? "The server could not provide masked operator configuration. Runtime env is still the bootstrap source for DATABASE_URL."
                  : "The Settings Center is asking the server for masked operator configuration."}
              </Text>
              {error ? (
                <Button size="xs" variant="light" mt="md" onClick={() => void loadSettings()}>
                  Retry settings load
                </Button>
              ) : null}
            </Card>
          ) : (
            <>
              <SystemStatusStrip settings={settings} />
              <SettingsWarningsPanel warnings={settings.warnings} />
              <Tabs defaultValue="overview" keepMounted={false}>
                <Tabs.List>
                  <Tabs.Tab value="overview">Overview</Tabs.Tab>
                  <Tabs.Tab value="auth">Auth</Tabs.Tab>
                  <Tabs.Tab value="gmail">Gmail Ingest</Tabs.Tab>
                  <Tabs.Tab value="juno">Juno Live</Tabs.Tab>
                  <Tabs.Tab value="notifications">Notifications</Tabs.Tab>
                  <Tabs.Tab value="advanced">Advanced</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="overview" pt="md">
                  <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
                    <NextActionsPanel settings={settings} />
                    <DiagnosticsPanel
                      deploymentMode={settings.environment.deploymentMode}
                      pending={actionPending}
                      result={actionResult}
                      onRun={runAction}
                    />
                  </SimpleGrid>
                  <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md" mt="md">
                    {settings.groups.filter((group) => group.id !== "advanced").map((group) => (
                      <GroupSummaryCard key={group.id} group={group} />
                    ))}
                  </SimpleGrid>
                </Tabs.Panel>

                {(["auth", "gmail", "juno", "notifications", "advanced"] as const).map((groupId) => (
                  <Tabs.Panel key={groupId} value={groupId} pt="md">
                    {groupsById[groupId] ? (
                      <Stack gap="md">
                        {groupId === "auth" ? <AuthProviderCard settings={settings} /> : null}
                        <SettingsGroupCard
                          group={groupsById[groupId]}
                          draft={draft}
                          saving={savingGroup === groupId}
                          onDraftChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
                          onSave={() => groupsById[groupId] && void saveGroup(groupsById[groupId])}
                          onClear={(setting) => groupsById[groupId] && void clearSetting(groupsById[groupId], setting)}
                        />
                      </Stack>
                    ) : null}
                  </Tabs.Panel>
                ))}
              </Tabs>
            </>
          )}
        </Stack>
      </Container>
    </Box>
  );
}

function SettingsWarningsPanel({ warnings }: { warnings: SettingsWarning[] }) {
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

function SystemStatusStrip({ settings }: { settings: SettingsResponse }) {
  const sourceCounts = countSources(settings.groups.find((group) => group.id === "advanced")?.settings ?? []);
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
      <StatusCard icon={Database} label="Data mode" value={settings.dataMode.value === "demo" ? "Demo" : "Real mailbox"} detail={settings.dataMode.detail} />
      <StatusCard icon={ShieldCheck} label="Auth bootstrap" value={settings.security.authBootstrap.status} detail={settings.security.authBootstrap.detail} />
      <StatusCard icon={Settings} label="DB overrides" value={String(sourceCounts.database)} detail={`${sourceCounts.runtime} runtime fallback values`} />
      <StatusCard icon={Globe2} label="Site address" value={settings.environment.appBaseUrl ? "Configured" : "Not set"} detail={settings.environment.appBaseUrl ?? settings.environment.currentRequestOrigin ?? "No request origin"} />
    </SimpleGrid>
  );
}

function StatusCard({ icon: Icon, label, value, detail }: {
  icon: typeof Database;
  label: string;
  value: string;
  detail: string;
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
          <Text size="sm" c="dimmed">
            {detail}
          </Text>
        </Stack>
      </Group>
    </Card>
  );
}

function NextActionsPanel({ settings }: { settings: SettingsResponse }) {
  return (
    <Card>
      <Stack gap="sm">
        <Group gap="xs">
          <CheckCircle2 size={18} aria-hidden="true" />
          <Text fw={700}>Next Actions</Text>
        </Group>
        {settings.nextActions.map((action) => (
          <Box key={action.id}>
            <Group gap={6}>
              <Badge color={severityColor(action.severity)} variant="light">
                {action.severity}
              </Badge>
              <Text fw={700}>{action.label}</Text>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>
              {action.detail}
            </Text>
          </Box>
        ))}
      </Stack>
    </Card>
  );
}

function DiagnosticsPanel({ deploymentMode, pending, result, onRun }: {
  deploymentMode: SettingsResponse["environment"]["deploymentMode"];
  pending: string | null;
  result: ActionResult | null;
  onRun: (action: "test-gmail" | "test-juno-session" | "refresh-status" | "run-demo-seed") => void;
}) {
  return (
    <Card>
      <Stack gap="sm">
        <Group gap="xs">
          <MailSearch size={18} aria-hidden="true" />
          <Text fw={700}>Diagnostics</Text>
        </Group>
        <Group gap="xs">
          <Button size="xs" loading={pending === "test-gmail"} onClick={() => onRun("test-gmail")}>
            Test Gmail
          </Button>
          <Button size="xs" variant="light" loading={pending === "test-juno-session"} onClick={() => onRun("test-juno-session")}>
            Test Juno session
          </Button>
          <Button size="xs" variant="light" leftSection={<RotateCw size={14} aria-hidden="true" />} loading={pending === "refresh-status"} onClick={() => onRun("refresh-status")}>
            Refresh status
          </Button>
          {deploymentMode !== "production" ? (
            <Button size="xs" variant="light" color="gray" loading={pending === "run-demo-seed"} onClick={() => onRun("run-demo-seed")}>
              Run demo seed
            </Button>
          ) : null}
        </Group>
        {result ? (
          <Code block>{JSON.stringify(result, null, 2)}</Code>
        ) : (
          <Text size="sm" c="dimmed">
            Actions never place catalog rows into cart, wishlist, checkout, or ordering flows.
          </Text>
        )}
      </Stack>
    </Card>
  );
}

function GroupSummaryCard({ group }: { group: SettingsGroup }) {
  const missing = group.settings.filter((setting) => setting.state === "missing").length;
  return (
    <Card>
      <Group justify="space-between">
        <Text fw={700}>{group.label}</Text>
        <Badge color={groupStateColor(group.state)} variant="light">
          {group.state}
        </Badge>
      </Group>
      <Text size="sm" c="dimmed" mt="sm">
        {group.settings.length} settings, {missing} missing.
      </Text>
    </Card>
  );
}

function AuthProviderCard({ settings }: { settings: SettingsResponse }) {
  const provider = settings.units.authProvider;
  return (
    <Card>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text fw={700}>Auth Provider</Text>
            <Text size="sm" c="dimmed">
              Generic OAuth/OIDC provider unit. The Site address setting owns the callback URL; runtime env is only a fallback.
            </Text>
          </Stack>
          <Badge color={unitStatusColor(provider.status)} variant="light">
            {provider.status}
          </Badge>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
          <SignalFact label="Provider type" value="Generic OAuth/OIDC" />
          <SignalFact label="Display name" value={provider.displayName} />
          <SignalFact label="Button label" value={provider.buttonLabel} />
          <SignalFact label="Provider ID" value={provider.providerId ?? "not configured"} />
          <SignalFact label="Client ID" value={provider.clientId ?? "not configured"} />
          <SignalFact label="Client secret" value={provider.clientSecretConfigured ? "configured" : "not configured"} />
          <SignalFact label="Scopes" value={provider.scopes.length > 0 ? provider.scopes.join(" ") : "not configured"} />
          <SignalFact label="Admin mapping" value={provider.adminEmailAllowlistConfigured || provider.adminClaimMappingConfigured ? "configured" : "not configured"} />
        </SimpleGrid>

        <Box>
          <Text size="sm" fw={700}>Callback URL</Text>
          <Group gap="xs" mt={4} align="center">
            <Code>{provider.callbackUrl ?? "Set Site address and Provider ID"}</Code>
            <Button
              size="xs"
              variant="light"
              leftSection={<Copy size={14} aria-hidden="true" />}
              disabled={!provider.callbackUrl}
              onClick={() => {
                if (provider.callbackUrl) {
                  void navigator.clipboard?.writeText(provider.callbackUrl);
                }
              }}
            >
              Copy callback URL
            </Button>
          </Group>
        </Box>

        <Text size="sm" c="dimmed">
          {provider.detail}
        </Text>
      </Stack>
    </Card>
  );
}

function SignalFact({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text size="xs" tt="uppercase" fw={700} c="dimmed">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </Box>
  );
}

function SettingsGroupCard({ group, draft, saving, onDraftChange, onSave, onClear }: {
  group: SettingsGroup;
  draft: DraftValues;
  saving: boolean;
  onDraftChange: (key: string, value: PatchValue) => void;
  onSave: () => void;
  onClear: (setting: SettingDescriptor) => void;
}) {
  const visibleSettings = group.id === "advanced" ? group.settings : group.settings.filter((setting) => !setting.advanced);
  const editableSettings = visibleSettings.filter((setting) => setting.editable);
  return (
    <Card>
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Text fw={700}>{group.label}</Text>
          <Text size="sm" c="dimmed">
            Source badges show database overrides, runtime fallback, schema defaults, or unset values.
          </Text>
        </Stack>
        <Badge color={groupStateColor(group.state)} variant="light">
          {group.state}
        </Badge>
      </Group>

      {group.id === "notifications" && group.settings.length === 0 ? (
        <Alert mt="md" color="blue" title="Notification settings">
          Notification channels and rules are managed in the dashboard Notification Center. External webhook sending remains opt-in and secrets stay masked.
        </Alert>
      ) : null}

      <Stack gap="md" mt="md">
        {visibleSettings.map((setting) => (
          <SettingEditor
            key={setting.key}
            setting={setting}
            draftValue={draft[setting.key]}
            onChange={(value) => onDraftChange(setting.key, value)}
            onClear={() => onClear(setting)}
          />
        ))}
      </Stack>

      {group.id === "advanced" ? <AdvancedSourceTable settings={group.settings} /> : null}

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

function SettingEditor({ setting, draftValue, onChange, onClear }: {
  setting: SettingDescriptor;
  draftValue: PatchValue | undefined;
  onChange: (value: PatchValue) => void;
  onClear: () => void;
}) {
  const pendingClear = draftValue === null;
  const value = draftValue !== undefined && draftValue !== null ? draftValue : setting.secret ? "" : setting.value ?? "";

  return (
    <Box>
      <Group justify="space-between" gap="xs" align="flex-start">
        <Stack gap={4} maw={520}>
          <Group gap={6}>
            <Text fw={700}>{setting.label}</Text>
            <SourceBadge source={setting.source} />
            <StateBadge setting={setting} />
            {setting.secret ? (
              <Badge color="gray" variant="outline">
                secret
              </Badge>
            ) : null}
          </Group>
          <Text size="sm" c="dimmed">
            {setting.help}
          </Text>
          <Text size="sm">
            Effective: <Text span fw={700}>{pendingClear ? "Will reset to runtime/default" : setting.displayValue}</Text>
          </Text>
        </Stack>
        {setting.clearable ? (
          <Button size="xs" variant="light" color="gray" onClick={onClear}>
            Clear override
          </Button>
        ) : null}
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
        label="Database override"
        checked={Boolean(value)}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    );
  }
  if (setting.type === "number") {
    return (
      <NumberInput
        label="Database override"
        value={typeof value === "number" ? value : value === "" ? "" : Number(value)}
        allowDecimal={false}
        onChange={(nextValue) => onChange(typeof nextValue === "number" ? nextValue : String(nextValue))}
      />
    );
  }
  if (setting.type === "select") {
    return (
      <NativeSelect
        label="Database override"
        value={typeof value === "string" ? value : ""}
        data={setting.options?.map((option) => ({ value: option.value, label: option.label })) ?? []}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }
  if (setting.secret) {
    return (
      <PasswordInput
        label="New secret override"
        placeholder="Leave blank for no change"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }
  if (setting.type === "csv" || setting.key === "auth_trusted_origins") {
    return (
      <Textarea
        label="Database override"
        minRows={2}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }
  return (
    <TextInput
      label="Database override"
      value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function AdvancedSourceTable({ settings }: { settings: SettingDescriptor[] }) {
  return (
    <Table.ScrollContainer minWidth={760} mt="lg">
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Setting</Table.Th>
            <Table.Th>Source</Table.Th>
            <Table.Th>State</Table.Th>
            <Table.Th>Value</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {settings.map((setting) => (
            <Table.Tr key={setting.key}>
              <Table.Td>
                <Text fw={600}>{setting.key}</Text>
              </Table.Td>
              <Table.Td><SourceBadge source={setting.source} /></Table.Td>
              <Table.Td><StateBadge setting={setting} /></Table.Td>
              <Table.Td>{setting.displayValue}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function SourceBadge({ source }: { source: SettingDescriptor["source"] }) {
  const colors = {
    database: "blue",
    runtime: "grape",
    default: "teal",
    unset: "red",
  } satisfies Record<SettingDescriptor["source"], string>;
  return (
    <Badge color={colors[source]} variant="light" size="xs">
      {source}
    </Badge>
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

function groupStateColor(state: SettingsGroup["state"]): string {
  if (state === "complete") {
    return "green";
  }
  if (state === "warning") {
    return "yellow";
  }
  if (state === "missing") {
    return "red";
  }
  return "gray";
}

function unitStatusColor(status: SettingsResponse["units"]["authProvider"]["status"]): string {
  if (status === "ready") {
    return "green";
  }
  if (status === "missing" || status === "blocked" || status === "invalid") {
    return "red";
  }
  if (status === "warning") {
    return "yellow";
  }
  return "gray";
}

function severityColor(severity: SettingsWarning["severity"]): string {
  if (severity === "critical") {
    return "red";
  }
  if (severity === "warning") {
    return "yellow";
  }
  return "blue";
}

function countSources(settings: SettingDescriptor[]): Record<SettingDescriptor["source"], number> {
  return settings.reduce(
    (counts, setting) => ({ ...counts, [setting.source]: counts[setting.source] + 1 }),
    { database: 0, runtime: 0, default: 0, unset: 0 },
  );
}

function maskActionResult(payload: ActionResult): ActionResult {
  return JSON.parse(
    JSON.stringify(payload, (key, value) => {
      if (/secret|password|token|authorization|cookie|private_key|service_account/i.test(key)) {
        return "[redacted]";
      }
      return value;
    }),
  ) as ActionResult;
}
