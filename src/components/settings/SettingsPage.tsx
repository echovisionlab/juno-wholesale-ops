"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
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
  ScrollArea,
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
type SettingsActionName = "test-gmail" | "test-juno-session" | "refresh-status" | "run-demo-seed";
type ActionSummary = {
  title: string;
  detail: string;
  color: "green" | "yellow" | "red" | "blue";
};

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
  const [actionSummary, setActionSummary] = useState<ActionSummary | null>(null);
  const [diagnosticsPayload, setDiagnosticsPayload] = useState<ActionResult | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
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

  async function runAction(action: SettingsActionName) {
    setActionPending(action);
    setError(null);
    setActionSummary(null);
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
      setDiagnosticsPayload(maskActionResult({ action, httpStatus: response.status, ...payload }));
      setActionSummary(summarizeAction(action, payload, response.status, payload.settings ?? settings));
    } finally {
      setActionPending(null);
    }
  }

  async function copyDiagnostics() {
    if (!diagnosticsPayload) {
      return;
    }
    try {
      await navigator.clipboard?.writeText(JSON.stringify(diagnosticsPayload, null, 2));
      setCopyStatus("Sanitized diagnostics copied.");
    } catch {
      setCopyStatus("Browser denied clipboard access. Diagnostics remain visible for manual copy.");
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
                Read-only observation only. Runtime configuration bootstraps infrastructure; saved operator settings and mail sources live in Postgres.
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
                  ? "The server could not provide masked operator configuration. Runtime bootstrap still provides DATABASE_URL."
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
                  <Tabs.Tab value="mail">Mail Sources</Tabs.Tab>
                  <Tabs.Tab value="juno">Juno Live</Tabs.Tab>
                  <Tabs.Tab value="notifications">Notifications</Tabs.Tab>
                  <Tabs.Tab value="advanced">Advanced</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="overview" pt="md">
                  <Stack gap="md">
                    <OverviewUnitsGrid settings={settings} />
                    <ResponsiveGrid minWidth={360} gap="md">
                      <NextActionsPanel settings={settings} />
                      <SettingsActionsPanel
                        deploymentMode={settings.environment.deploymentMode}
                        pending={actionPending}
                        summary={actionSummary}
                        onRun={runAction}
                      />
                    </ResponsiveGrid>
                  </Stack>
                </Tabs.Panel>

                {(["auth", "mail", "juno", "notifications", "advanced"] as const).map((groupId) => (
                  <Tabs.Panel key={groupId} value={groupId} pt="md">
                    {groupsById[groupId] ? (
                      <Stack gap="md">
                        {groupId === "auth" ? (
                          <>
                            <AuthAccessCards settings={settings} />
                            <AuthProviderCard settings={settings} />
                          </>
                        ) : null}
                        {groupId === "mail" ? <MailSourcesCard settings={settings} /> : null}
                        {groupId === "juno" ? <JunoLiveSessionCard settings={settings} group={groupsById[groupId]} /> : null}
                        {groupId === "notifications" ? <NotificationsUnitCard settings={settings} /> : null}
                        {groupId === "advanced" ? (
                          <AdvancedDiagnosticsPanel
                            diagnosticsPayload={diagnosticsPayload}
                            open={diagnosticsOpen}
                            copyStatus={copyStatus}
                            onToggle={() => {
                              setDiagnosticsOpen((current) => !current);
                              setCopyStatus(null);
                            }}
                            onCopy={() => void copyDiagnostics()}
                          />
                        ) : null}
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
    <ResponsiveGrid minWidth={180} gap="sm">
      <StatusCard icon={Database} label="Data mode" value={settings.dataMode.value === "demo" ? "Demo" : "Real mailbox"} detail={settings.dataMode.detail} />
      <StatusCard icon={ShieldCheck} label="Auth bootstrap" value={settings.security.authBootstrap.status} detail={settings.security.authBootstrap.detail} />
      <StatusCard icon={Settings} label="Saved settings" value={String(sourceCounts.database)} detail={`${sourceCounts.runtime} runtime fallback values`} />
      <StatusCard icon={Globe2} label="Site address" value={settings.environment.appBaseUrl ? "Configured" : "Not set"} detail={settings.environment.appBaseUrl ?? settings.environment.currentRequestOrigin ?? "No request origin"} />
    </ResponsiveGrid>
  );
}

function ResponsiveGrid({ children, minWidth, gap }: { children: ReactNode; minWidth: number; gap: "xs" | "sm" | "md" }) {
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

function OverviewUnitsGrid({ settings }: { settings: SettingsResponse }) {
  const units = buildOverviewUnits(settings);
  return (
    <ResponsiveGrid minWidth={200} gap="md">
      {units.map((unit) => (
        <UnitOverviewCard key={unit.label} {...unit} />
      ))}
    </ResponsiveGrid>
  );
}

function UnitOverviewCard({
  label,
  status,
  detail,
  action,
}: {
  label: string;
  status: "Ready" | "Needs attention" | "Disabled";
  detail: string;
  action: string;
}) {
  return (
    <Card>
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start">
          <Text fw={700}>{label}</Text>
          <Badge color={overviewStatusColor(status)} variant="light">
            {status}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          {detail}
        </Text>
        <Text size="sm" fw={700}>
          Action: <Text span fw={500}>{action}</Text>
        </Text>
      </Stack>
    </Card>
  );
}

function SettingsActionsPanel({ deploymentMode, pending, summary, onRun }: {
  deploymentMode: SettingsResponse["environment"]["deploymentMode"];
  pending: string | null;
  summary: ActionSummary | null;
  onRun: (action: SettingsActionName) => void;
}) {
  return (
    <Card>
      <Stack gap="sm">
        <Group gap="xs">
          <MailSearch size={18} aria-hidden="true" />
          <Text fw={700}>Actions</Text>
        </Group>
        <Group gap="xs">
          <Button size="xs" loading={pending === "test-gmail"} onClick={() => onRun("test-gmail")}>
            Test Mail Source
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
        {summary ? (
          <>
            <Alert color={summary.color} variant="light" title={summary.title}>
              {summary.detail}
            </Alert>
            <Text size="sm" c="dimmed">
              Detailed diagnostics are available only under Advanced.
            </Text>
          </>
        ) : (
          <Text size="sm" c="dimmed">
            Actions refresh status or run read-only smoke checks. Detailed diagnostics are available only under Advanced.
          </Text>
        )}
      </Stack>
    </Card>
  );
}

function AdvancedDiagnosticsPanel({
  diagnosticsPayload,
  open,
  copyStatus,
  onToggle,
  onCopy,
}: {
  diagnosticsPayload: ActionResult | null;
  open: boolean;
  copyStatus: string | null;
  onToggle: () => void;
  onCopy: () => void;
}) {
  return (
    <Card>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text fw={700}>Diagnostics</Text>
            <Text size="sm" c="dimmed">
              View and copy sanitized diagnostics. Secrets, tokens, cookies, passwords, and service account contents are redacted.
            </Text>
          </Stack>
          <Button size="xs" variant="light" onClick={onToggle}>
            {open ? "Hide sanitized JSON" : "View sanitized JSON"}
          </Button>
        </Group>
        {!diagnosticsPayload ? (
          <Alert color="blue" title="No diagnostics captured">
            Run Refresh status or a read-only smoke check from Overview first.
          </Alert>
        ) : null}
        {open && diagnosticsPayload ? (
          <>
            <Group justify="space-between" align="center">
              <Text size="sm" fw={700}>Sanitized JSON</Text>
              <Button size="xs" variant="light" leftSection={<Copy size={14} aria-hidden="true" />} onClick={onCopy}>
                Copy diagnostics
              </Button>
            </Group>
            {copyStatus ? <Text size="sm" c="green.7">{copyStatus}</Text> : null}
            <ScrollArea h={320} type="auto">
              <Code block>{JSON.stringify(diagnosticsPayload, null, 2)}</Code>
            </ScrollArea>
          </>
        ) : null}
      </Stack>
    </Card>
  );
}

function AuthAccessCards({ settings }: { settings: SettingsResponse }) {
  const siteAddress = findSetting(settings, "auth_base_url");
  const trustedOrigins = findSetting(settings, "auth_trusted_origins");
  const emailPassword = findSetting(settings, "auth_email_password_enabled");
  const externalProvider = settings.units.authProvider;
  const currentOriginMatches = settings.environment.appBaseUrl && settings.environment.currentRequestOrigin
    ? normalizeOrigin(settings.environment.appBaseUrl) === normalizeOrigin(settings.environment.currentRequestOrigin)
    : false;

  return (
    <ResponsiveGrid minWidth={280} gap="md">
      <Card>
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={700}>Admin Gate</Text>
            <Badge color={settings.warnings.some((warning) => warning.id.startsWith("auth_") && warning.severity === "critical") ? "red" : "green"} variant="light">
              {settings.warnings.some((warning) => warning.id.startsWith("auth_") && warning.severity === "critical") ? "Needs attention" : "Ready"}
            </Badge>
          </Group>
          <SignalFact label="Admin access protection" value="Enabled" />
          <SignalFact label="Site address" value={siteAddress?.displayValue ?? settings.environment.appBaseUrl ?? "Not set"} />
          <SignalFact label="Current origin match" value={currentOriginMatches ? "matches" : "review required"} />
          <SignalFact label="Trusted origins" value={trustedOrigins?.state === "configured" ? "configured" : "not configured"} />
        </Stack>
      </Card>

      <Card>
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={700}>Admin Access</Text>
            <Badge color={settings.security.authBootstrap.status === "ready" ? "green" : "red"} variant="light">
              {settings.security.authBootstrap.status === "ready" ? "Ready" : "Blocked"}
            </Badge>
          </Group>
          <SignalFact label="Admin users" value={formatAdminCount(settings.security.authBootstrap.adminUserCount)} />
          <SignalFact label="Initial admin seed" value={settings.security.authBootstrap.hasInitialAdminEnv ? "configured" : "not configured"} />
          <SignalFact label="External admin mapping" value={settings.security.authBootstrap.hasExternalAdminMapping ? "configured" : "not configured"} />
          <Text size="sm" c="dimmed">{settings.security.authBootstrap.detail}</Text>
        </Stack>
      </Card>

      <Card>
        <Stack gap="xs">
          <Text fw={700}>Sign-in Methods</Text>
          <SignalFact label="Email/password login" value={emailPassword?.displayValue ?? "Default value"} />
          <SignalFact label="External SSO provider" value={externalProvider.enabled ? externalProvider.status : "disabled"} />
          <SignalFact label="SSO login button" value={externalProvider.status === "ready" ? externalProvider.buttonLabel : "shown when provider is ready"} />
        </Stack>
      </Card>
    </ResponsiveGrid>
  );
}

function AuthProviderCard({ settings }: { settings: SettingsResponse }) {
  const provider = settings.units.authProvider;
  const [callbackCopyStatus, setCallbackCopyStatus] = useState<string | null>(null);

  async function copyCallbackUrl() {
    if (!provider.callbackUrl) {
      return;
    }
    try {
      await navigator.clipboard?.writeText(provider.callbackUrl);
      setCallbackCopyStatus("Callback URL copied.");
    } catch {
      setCallbackCopyStatus("Browser denied clipboard access. Callback URL remains visible for manual copy.");
    }
  }

  return (
    <Card>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text fw={700}>Auth Provider</Text>
            <Text size="sm" c="dimmed">
              Generic OAuth/OIDC provider unit. The Site address setting owns the callback URL; runtime configuration is only a bootstrap fallback.
            </Text>
          </Stack>
          <Badge color={unitStatusColor(provider.status)} variant="light">
            {provider.status}
          </Badge>
        </Group>

        <ResponsiveGrid minWidth={240} gap="xs">
          <SignalFact label="Provider type" value="Generic OAuth/OIDC" />
          <SignalFact label="Provider preset" value={inferProviderPreset(provider)} />
          <SignalFact label="Enabled" value={provider.enabled ? "enabled" : "disabled"} />
          <SignalFact label="Display name" value={provider.displayName} />
          <SignalFact label="Button label" value={provider.buttonLabel} />
          <SignalFact label="Provider ID" value={provider.providerId ?? "not configured"} />
          <SignalFact label="Logo URL" value={provider.logoUrl ?? "not configured"} />
          <SignalFact label="Discovery / issuer URL" value={provider.discoveryUrl ?? "not configured"} />
          <SignalFact label="Client ID" value={provider.clientId ?? "not configured"} />
          <SignalFact label="Client secret" value={provider.clientSecretConfigured ? "configured" : "not configured"} />
          <SignalFact label="Scopes" value={provider.scopes.length > 0 ? provider.scopes.join(" ") : "not configured"} />
          <SignalFact label="Require issuer validation" value="Use provider discovery document" />
          <SignalFact label="Admin mapping" value={provider.adminEmailAllowlistConfigured || provider.adminClaimMappingConfigured ? "configured" : "not configured"} />
        </ResponsiveGrid>

        <Box>
          <Text size="sm" fw={700}>Callback URL</Text>
          <Group gap="xs" mt={4} align="center">
            <Code>{provider.callbackUrl ?? "Set Site address and Provider ID"}</Code>
            <Button
              size="xs"
              variant="light"
              leftSection={<Copy size={14} aria-hidden="true" />}
              disabled={!provider.callbackUrl}
              onClick={() => void copyCallbackUrl()}
            >
              Copy callback URL
            </Button>
          </Group>
          {callbackCopyStatus ? <Text size="xs" c="dimmed" mt={4}>{callbackCopyStatus}</Text> : null}
        </Box>

        <Text size="sm" c="dimmed">
          {provider.detail} Register the callback URL in the provider console, then use the Sign in page to test the SSO button.
        </Text>
      </Stack>
    </Card>
  );
}

function MailSourcesCard({ settings }: { settings: SettingsResponse }) {
  const sources = settings.mailSources;
  return (
    <Card>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text fw={700}>Gmail Workspace Ingest</Text>
            <Text size="sm" c="dimmed">
              Gmail uses Google Workspace delegation with a JSON service account credential. Demo mode can run without Gmail; real mailbox mode requires a runnable Gmail source.
            </Text>
          </Stack>
          <Badge color={unitStatusColor(settings.units.mail.status)} variant="light">
            {settings.units.mail.status}
          </Badge>
        </Group>
        <ResponsiveGrid minWidth={220} gap="xs">
          <SignalFact label="Mode impact" value={settings.dataMode.value === "demo" ? "Gmail optional in Demo mode" : "Gmail required in Real mailbox mode"} />
          <SignalFact label="Runnable Gmail sources" value={String(sources.filter((source) => source.provider === "gmail" && source.isActive && source.credentialConfigured).length)} />
          <SignalFact label="Service account key" value={sources.some((source) => source.credentialConfigured) ? "configured" : "not configured"} />
        </ResponsiveGrid>

        {sources.length === 0 ? (
          <Alert color={settings.dataMode.value === "real_mailbox" ? "red" : "blue"} title="No mail sources configured">
            {settings.dataMode.value === "real_mailbox"
              ? "Real mailbox mode requires delegated mailbox access and a service account key reference."
              : "Gmail is optional in Demo mode. Use demo data until real mailbox settings are ready."}
          </Alert>
        ) : (
          <Table.ScrollContainer minWidth={840}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Mailbox</Table.Th>
                  <Table.Th>Provider</Table.Th>
                  <Table.Th>Auth</Table.Th>
                  <Table.Th>Credential</Table.Th>
                  <Table.Th>Query</Table.Th>
                  <Table.Th>Storage</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sources.map((source) => (
                  <Table.Tr key={source.id}>
                    <Table.Td>
                      <Text fw={600}>{source.displayName ?? source.mailboxAddress}</Text>
                      <Text size="xs" c="dimmed">{source.mailboxAddress}</Text>
                    </Table.Td>
                    <Table.Td>{source.provider}</Table.Td>
                    <Table.Td>{source.authType}</Table.Td>
                    <Table.Td>
                      <Badge color={source.credentialConfigured ? "green" : "red"} variant="light" size="xs">
                        {source.credentialConfigured ? "configured" : "missing"}
                      </Badge>
                    </Table.Td>
                    <Table.Td maw={260}>
                      <Text size="sm" lineClamp={2}>{source.query}</Text>
                    </Table.Td>
                    <Table.Td>{source.storageDir}</Table.Td>
                    <Table.Td>
                      <Badge color={source.isActive ? "green" : "gray"} variant="light" size="xs">
                        {source.isActive ? "active" : "inactive"}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}

        <Text size="sm" c="dimmed">
          {settings.units.mail.detail} Use Test Mail Source from Overview for a read-only connection check.
        </Text>
      </Stack>
    </Card>
  );
}

function JunoLiveSessionCard({ settings, group }: { settings: SettingsResponse; group: SettingsGroup }) {
  const loginEmail = findGroupSetting(group, "juno_login_email");
  const loginPassword = findGroupSetting(group, "juno_login_password");
  const concurrency = findGroupSetting(group, "juno_live_concurrency");
  const delayMin = findGroupSetting(group, "juno_live_delay_min_ms");
  const delayMax = findGroupSetting(group, "juno_live_delay_max_ms");
  const pollInterval = findGroupSetting(group, "juno_live_poll_interval_ms");
  const autoEnqueue = findGroupSetting(group, "juno_live_auto_enqueue_on_interval");

  return (
    <Card>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text fw={700}>Juno Live Session</Text>
            <Text size="sm" c="dimmed">
              Optional read-only browser observation. Missing credentials do not block the app, but worker start stays disabled until session settings are ready.
            </Text>
          </Stack>
          <Badge color={unitStatusColor(settings.units.junoLive.status)} variant="light">
            {settings.units.junoLive.status}
          </Badge>
        </Group>
        <ResponsiveGrid minWidth={220} gap="xs">
          <SignalFact label="Login email" value={loginEmail?.state === "configured" ? "configured" : "not configured"} />
          <SignalFact label="Password" value={loginPassword?.state === "configured" ? "configured" : "not configured"} />
          <SignalFact label="Poll interval" value={pollInterval?.displayValue ?? "manual only"} />
          <SignalFact label="Concurrency" value={concurrency?.displayValue ?? "Default value"} />
          <SignalFact label="Delay window" value={`${delayMin?.displayValue ?? "Default value"} to ${delayMax?.displayValue ?? "Default value"}`} />
          <SignalFact label="Auto enqueue" value={autoEnqueue?.displayValue ?? "Default value"} />
        </ResponsiveGrid>
        <Alert color="blue" title="Read-only boundary">
          No cart, no wishlist, no checkout, no ordering. The browser worker only opens product pages for observed stock status.
        </Alert>
        <Text size="sm" c="dimmed">{settings.units.junoLive.detail}</Text>
      </Stack>
    </Card>
  );
}

function NotificationsUnitCard({ settings }: { settings: SettingsResponse }) {
  return (
    <Card>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text fw={700}>Notifications</Text>
            <Text size="sm" c="dimmed">
              In-app notifications are valid by default. Generic webhook delivery remains optional and external sending requires explicit opt-in.
            </Text>
          </Stack>
          <Badge color={unitStatusColor(settings.units.notifications.status)} variant="light">
            {settings.units.notifications.status}
          </Badge>
        </Group>
        <ResponsiveGrid minWidth={220} gap="xs">
          <SignalFact label="In-app channel" value="ready" />
          <SignalFact label="Webhook" value="optional; not configured is OK" />
          <SignalFact label="Dispatch" value="dry-run by default" />
        </ResponsiveGrid>
        <Text size="sm" c="dimmed">
          {settings.units.notifications.detail}
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
            Source badges show saved settings, runtime fallback values, defaults, or values that are not set.
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
            Effective: <Text span fw={700}>{pendingClear ? "Will reset to runtime fallback or default" : setting.displayValue}</Text>
          </Text>
        </Stack>
        {setting.clearable ? (
          <Button size="xs" variant="light" color="gray" onClick={onClear}>
            Clear saved setting
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
        label="Saved setting"
        checked={Boolean(value)}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    );
  }
  if (setting.type === "number") {
    return (
      <NumberInput
        label="Saved setting"
        value={typeof value === "number" ? value : value === "" ? "" : Number(value)}
        allowDecimal={false}
        onChange={(nextValue) => onChange(typeof nextValue === "number" ? nextValue : String(nextValue))}
      />
    );
  }
  if (setting.type === "select") {
    return (
      <NativeSelect
        label="Saved setting"
        value={typeof value === "string" ? value : ""}
        data={setting.options?.map((option) => ({ value: option.value, label: option.label })) ?? []}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }
  if (setting.secret) {
    return (
      <PasswordInput
        label="New secret"
        placeholder="Leave blank for no change"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }
  if (setting.type === "csv" || setting.key === "auth_trusted_origins") {
    return (
      <Textarea
        label="Saved setting"
        minRows={2}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }
  return (
    <TextInput
      label="Saved setting"
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
  const labels = {
    database: "Saved setting",
    runtime: "Runtime fallback",
    default: "Default",
    unset: "Not set",
  } satisfies Record<SettingDescriptor["source"], string>;
  return (
    <Badge color={colors[source]} variant="light" size="xs">
      {labels[source]}
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

function buildOverviewUnits(settings: SettingsResponse): Array<{
  label: string;
  status: "Ready" | "Needs attention" | "Disabled";
  detail: string;
  action: string;
}> {
  return [
    {
      label: "Data Mode",
      status: "Ready",
      detail: settings.dataMode.value === "demo" ? "Demo mode uses synthetic data and keeps Gmail optional." : "Real mailbox mode requires a runnable Gmail source.",
      action: settings.dataMode.value === "demo" ? "Seed demo data when you want a preview." : "Configure Gmail Workspace ingest.",
    },
    {
      label: "Auth & Admin Access",
      status: settings.security.authBootstrap.status === "ready" ? "Ready" : "Needs attention",
      detail: settings.security.authBootstrap.detail,
      action: settings.security.authBootstrap.status === "ready" ? "Keep at least one admin access path configured." : "Add an initial admin, existing admin, or SSO admin mapping.",
    },
    {
      label: "Gmail Ingest",
      status: unitOverviewStatus(settings.units.mail.status),
      detail: settings.units.mail.detail,
      action: settings.dataMode.value === "demo" ? "Optional until Real mailbox mode is selected." : "Add a runnable Gmail source.",
    },
    {
      label: "Juno Live",
      status: unitOverviewStatus(settings.units.junoLive.status),
      detail: settings.units.junoLive.detail,
      action: settings.units.junoLive.status === "disabled" ? "Leave disabled or configure a read-only session." : "Review pacing before worker start.",
    },
    {
      label: "Notifications",
      status: unitOverviewStatus(settings.units.notifications.status),
      detail: settings.units.notifications.detail,
      action: "Use in-app alerts; configure webhook only when needed.",
    },
  ];
}

function unitOverviewStatus(status: SettingsResponse["units"]["mail"]["status"]): "Ready" | "Needs attention" | "Disabled" {
  if (status === "ready") {
    return "Ready";
  }
  if (status === "disabled") {
    return "Disabled";
  }
  return "Needs attention";
}

function overviewStatusColor(status: "Ready" | "Needs attention" | "Disabled"): string {
  if (status === "Ready") {
    return "green";
  }
  if (status === "Needs attention") {
    return "yellow";
  }
  return "gray";
}

function summarizeAction(
  action: SettingsActionName,
  payload: ActionResult & { settings?: SettingsResponse; error?: string; status?: string; ok?: boolean },
  httpStatus: number,
  currentSettings: SettingsResponse | null,
): ActionSummary {
  if (httpStatus >= 400) {
    return {
      title: action === "refresh-status" ? "Status refresh failed" : "Action failed",
      detail: `API returned ${httpStatus}: ${payload.error ?? "No additional detail returned."}`,
      color: "red",
    };
  }
  if (action === "refresh-status") {
    return {
      title: `Status refreshed ${new Date().toLocaleTimeString()}`,
      detail: currentSettings ? summarizeSettingsHealth(currentSettings) : "Settings cards updated.",
      color: "green",
    };
  }
  if (action === "run-demo-seed") {
    return {
      title: "Demo seed finished",
      detail: payload.error ?? "Synthetic demo data action completed.",
      color: payload.ok === false ? "yellow" : "green",
    };
  }
  if (action === "test-gmail") {
    return {
      title: "Mail source check finished",
      detail: payload.status ? `Result: ${String(payload.status)}` : "Read-only Gmail smoke check completed.",
      color: payload.ok === false ? "yellow" : "green",
    };
  }
  return {
    title: "Juno session check finished",
    detail: payload.status ? `Result: ${String(payload.status)}` : "Read-only Juno session preflight completed.",
    color: payload.ok === false ? "yellow" : "green",
  };
}

function summarizeSettingsHealth(settings: SettingsResponse): string {
  const sections = buildOverviewUnits(settings);
  const ready = sections.filter((section) => section.status === "Ready").length;
  const warnings = sections.filter((section) => section.status === "Needs attention").length
    + settings.warnings.filter((warning) => warning.severity === "warning").length;
  const blockers = settings.warnings.filter((warning) => warning.severity === "critical").length
    + (settings.security.authBootstrap.status === "blocked" ? 1 : 0);
  return `${ready} sections ready · ${warnings} warning${warnings === 1 ? "" : "s"} · ${blockers} blocker${blockers === 1 ? "" : "s"}`;
}

function findSetting(settings: SettingsResponse, key: string): SettingDescriptor | undefined {
  return settings.groups.find((group) => group.id === "advanced")?.settings.find((setting) => setting.key === key)
    ?? settings.groups.flatMap((group) => group.settings).find((setting) => setting.key === key);
}

function findGroupSetting(group: SettingsGroup, key: string): SettingDescriptor | undefined {
  return group.settings.find((setting) => setting.key === key);
}

function formatAdminCount(count: number | null): string {
  if (count === null) {
    return "count unavailable";
  }
  return `${count} existing admin${count === 1 ? "" : "s"}`;
}

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function inferProviderPreset(provider: SettingsResponse["units"]["authProvider"]): string {
  const haystack = `${provider.displayName} ${provider.discoveryUrl ?? ""}`.toLowerCase();
  if (haystack.includes("google")) {
    return "Google";
  }
  if (haystack.includes("microsoft") || haystack.includes("entra")) {
    return "Microsoft Entra ID";
  }
  if (haystack.includes("okta")) {
    return "Okta";
  }
  if (haystack.includes("auth0")) {
    return "Auth0";
  }
  if (haystack.includes("keycloak")) {
    return "Keycloak";
  }
  return "Generic OIDC";
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
