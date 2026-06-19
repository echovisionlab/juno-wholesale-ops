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
  Modal,
  NativeSelect,
  NumberInput,
  PasswordInput,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Database,
  Globe2,
  MailSearch,
  Save,
  Settings,
  ShieldCheck,
  Plus,
  Trash2,
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
type SettingsActionName = "test-gmail" | "test-juno-session";
type SsoProviderProtocol = "oidc" | "oauth2";
type SsoProviderPreset = "custom_oidc" | "custom_oauth2" | "google_oidc" | "microsoft_entra_oidc" | "auth0_oidc" | "okta_oidc";
type SsoProviderDraft = {
  id?: string;
  providerId: string;
  displayName: string;
  protocol: SsoProviderProtocol;
  preset: SsoProviderPreset;
  buttonLabel: string;
  logoUrl: string;
  discoveryUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  enabled: boolean;
  sortOrder: number;
  adminEmailAllowlist: string;
  adminClaim: string;
  adminClaimValue: string;
};

const emptySsoProviderDraft: SsoProviderDraft = {
  providerId: "",
  displayName: "",
  protocol: "oidc",
  preset: "custom_oidc",
  buttonLabel: "",
  logoUrl: "",
  discoveryUrl: "",
  authorizationUrl: "",
  tokenUrl: "",
  userInfoUrl: "",
  clientId: "",
  clientSecret: "",
  scopes: "openid email profile",
  enabled: false,
  sortOrder: 0,
  adminEmailAllowlist: "",
  adminClaim: "",
  adminClaimValue: "",
};

const ssoProviderPresetOptions: Array<{
  value: SsoProviderPreset;
  label: string;
  protocol: SsoProviderProtocol;
  discoveryUrl?: string;
  scopes: string;
}> = [
  { value: "custom_oidc", label: "OpenID Connect", protocol: "oidc", scopes: "openid email profile" },
  { value: "custom_oauth2", label: "OAuth 2.0", protocol: "oauth2", scopes: "openid email profile" },
  { value: "google_oidc", label: "Google Workspace", protocol: "oidc", discoveryUrl: "https://accounts.google.com/.well-known/openid-configuration", scopes: "openid email profile" },
  { value: "microsoft_entra_oidc", label: "Microsoft Entra ID", protocol: "oidc", scopes: "openid email profile" },
  { value: "auth0_oidc", label: "Auth0", protocol: "oidc", scopes: "openid email profile" },
  { value: "okta_oidc", label: "Okta", protocol: "oidc", scopes: "openid email profile" },
];

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
  const [ssoProviderDraft, setSsoProviderDraft] = useState<SsoProviderDraft>(emptySsoProviderDraft);
  const [editingSsoProviderId, setEditingSsoProviderId] = useState<string | null>(null);
  const [ssoProviderPending, setSsoProviderPending] = useState<string | null>(null);
  const [ssoProviderModalOpen, setSsoProviderModalOpen] = useState(false);
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
        const message = payload.issues?.join(" ") ?? payload.error ?? `Settings save returned ${response.status}`;
        setError(message);
        notifications.show({ color: "red", title: "Save failed", message });
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
      notifications.show({ color: "green", title: "Settings saved", message: group.label });
    } finally {
      setSavingGroup(null);
    }
  }

  async function runAction(action: SettingsActionName) {
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
        const message = payload.error ?? `${action} returned ${response.status}`;
        setError(message);
        notifications.show({ color: "red", title: "Check failed", message });
      }
      if (payload.settings) {
        setSettings(payload.settings);
      }
      if (response.ok) {
        notifications.show({ color: payload.ok === false ? "yellow" : "green", title: summarizeActionTitle(action), message: payload.status ? String(payload.status) : undefined });
      }
    } finally {
      setActionPending(null);
    }
  }

  async function saveSsoProvider() {
    const editing = Boolean(editingSsoProviderId);
    const payload = {
      ...ssoProviderDraft,
      id: editingSsoProviderId ?? undefined,
      adminEmailAllowlist: ssoProviderDraft.adminEmailAllowlist,
      adminClaim: ssoProviderDraft.adminClaim,
      adminClaimValue: ssoProviderDraft.adminClaimValue,
    };
    if (editing && payload.clientSecret.trim() === "") {
      delete (payload as Partial<SsoProviderDraft>).clientSecret;
    }
    setSsoProviderPending(editing ? editingSsoProviderId : "new");
    setError(null);
    try {
      const response = await fetch("/api/settings/auth/sso-providers", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        settings?: SettingsResponse;
        error?: string;
        issues?: string[];
      };
      if (!response.ok || !result.settings) {
        const message = result.issues?.join(" ") ?? result.error ?? `SSO provider save returned ${response.status}`;
        setError(message);
        notifications.show({ color: "red", title: editing ? "Provider update failed" : "Provider create failed", message });
        return;
      }
      setSettings(result.settings);
      setSsoProviderDraft(emptySsoProviderDraft);
      setEditingSsoProviderId(null);
      setSsoProviderModalOpen(false);
      notifications.show({ color: "green", title: editing ? "Provider updated" : "Provider created", message: "Saved" });
    } finally {
      setSsoProviderPending(null);
    }
  }

  async function toggleSsoProvider(id: string, enabled: boolean) {
    setSsoProviderPending(id);
    setError(null);
    try {
      const response = await fetch("/api/settings/auth/sso-providers", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        settings?: SettingsResponse;
        error?: string;
        issues?: string[];
      };
      if (!response.ok || !result.settings) {
        const message = result.issues?.join(" ") ?? result.error ?? `SSO provider update returned ${response.status}`;
        setError(message);
        notifications.show({ color: "red", title: "Provider update failed", message });
        return;
      }
      setSettings(result.settings);
      notifications.show({ color: "green", title: enabled ? "Provider enabled" : "Provider disabled", message: "Saved" });
    } finally {
      setSsoProviderPending(null);
    }
  }

  async function deleteSsoProvider(id: string) {
    setSsoProviderPending(id);
    setError(null);
    try {
      const response = await fetch("/api/settings/auth/sso-providers", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        settings?: SettingsResponse;
        error?: string;
      };
      if (!response.ok || !result.settings) {
        const message = result.error ?? `SSO provider delete returned ${response.status}`;
        setError(message);
        notifications.show({ color: "red", title: "Provider delete failed", message });
        return;
      }
      setSettings(result.settings);
      if (editingSsoProviderId === id) {
        setSsoProviderDraft(emptySsoProviderDraft);
        setEditingSsoProviderId(null);
      }
      notifications.show({ color: "green", title: "Provider deleted", message: "Saved" });
    } finally {
      setSsoProviderPending(null);
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
              <Text c="dimmed">Read-only operator settings.</Text>
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
                  ? "The server could not load masked operator configuration. Check DATABASE_URL and Postgres."
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
                </Tabs.List>

                <Tabs.Panel value="overview" pt="md">
                  <Stack gap="md">
                    <OverviewUnitsGrid settings={settings} />
	                    <ResponsiveGrid minWidth={360} gap="md">
	                      <NextActionsPanel settings={settings} />
	                      <SettingsActionsPanel
	                        pending={actionPending}
	                        onRun={runAction}
	                      />
	                    </ResponsiveGrid>
                  </Stack>
                </Tabs.Panel>

                {(["auth", "mail", "juno", "notifications"] as const).map((groupId) => (
                  <Tabs.Panel key={groupId} value={groupId} pt="md">
                    {groupsById[groupId] ? (
                      <Stack gap="md">
                        {groupId === "auth" ? (
                          <>
                            <AuthAccessCards settings={settings} />
                            <AuthProviderCard
                              settings={settings}
                              draft={ssoProviderDraft}
                              editingId={editingSsoProviderId}
                              pending={ssoProviderPending}
                              onDraftChange={setSsoProviderDraft}
                              onEdit={(draft) => {
                                setSsoProviderDraft(draft);
                                setEditingSsoProviderId(draft.id ?? null);
                                setSsoProviderModalOpen(true);
                              }}
                              onCancel={() => {
                                setSsoProviderDraft(emptySsoProviderDraft);
                                setEditingSsoProviderId(null);
                                setSsoProviderModalOpen(false);
                              }}
                              onSave={() => void saveSsoProvider()}
                              onDelete={(id) => void deleteSsoProvider(id)}
                              onToggle={(id, enabled) => void toggleSsoProvider(id, enabled)}
                              modalOpen={ssoProviderModalOpen}
                              onAdd={() => {
                                setSsoProviderDraft(emptySsoProviderDraft);
                                setEditingSsoProviderId(null);
                                setSsoProviderModalOpen(true);
                              }}
                              onModalClose={() => {
                                setSsoProviderModalOpen(false);
                                setEditingSsoProviderId(null);
                                setSsoProviderDraft(emptySsoProviderDraft);
                              }}
                            />
                          </>
                        ) : null}
                        {groupId === "mail" ? <MailSourcesCard settings={settings} /> : null}
                        {groupId === "juno" ? <JunoLiveSessionCard settings={settings} group={groupsById[groupId]} /> : null}
                        {groupId === "notifications" ? <NotificationsUnitCard settings={settings} /> : null}
                        <SettingsGroupCard
                          group={groupsById[groupId]}
                          draft={draft}
                          saving={savingGroup === groupId}
                          onDraftChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
                          onSave={() => groupsById[groupId] && void saveGroup(groupsById[groupId])}
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
  const editableSettings = settings.groups.flatMap((group) => group.settings).filter((setting) => setting.editable);
  const missingSettings = editableSettings.filter((setting) => setting.state === "missing" || setting.state === "invalid");
	  return (
	    <ResponsiveGrid minWidth={180} gap="sm">
	      <StatusCard icon={Database} label="Database" value="Required" detail={settings.environment.lastUpdatedAt ? "Settings row available." : "Waiting for saved settings."} />
	      <StatusCard icon={ShieldCheck} label="Auth bootstrap" value={settings.security.authBootstrap.status} detail={settings.security.authBootstrap.detail} />
	      <StatusCard icon={Settings} label="Operator settings" value={missingSettings.length === 0 ? "Ready" : "Needs attention"} detail={missingSettings.length === 0 ? "Editable values are ready." : `${missingSettings.length} editable value${missingSettings.length === 1 ? "" : "s"} need attention.`} />
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

function SettingsActionsPanel({ pending, onRun }: {
  pending: string | null;
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
	        </Group>
	      </Stack>
	    </Card>
	  );
	}

function AuthAccessCards({ settings }: { settings: SettingsResponse }) {
  const siteAddress = findSetting(settings, "auth_base_url");
  const trustedOrigins = findSetting(settings, "auth_trusted_origins");
  const localLogin = findSetting(settings, "auth_email_password_login_enabled");
  const authProvider = settings.units.authProvider;
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
          <SignalFact label="Email/password login" value={localLogin?.displayValue ?? "enabled"} />
          <SignalFact label="External SSO providers" value={`${authProvider.readyProviderCount} ready / ${authProvider.enabledProviderCount} enabled / ${authProvider.providerCount} total`} />
          <SignalFact label="SSO login buttons" value={authProvider.readyProviderCount > 0 ? "shown for ready providers" : "hidden until a provider is ready"} />
        </Stack>
      </Card>
    </ResponsiveGrid>
  );
}

function AuthProviderCard({
  settings,
  draft,
  editingId,
  pending,
  onDraftChange,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onToggle,
  modalOpen,
  onAdd,
  onModalClose,
}: {
  settings: SettingsResponse;
  draft: SsoProviderDraft;
  editingId: string | null;
  pending: string | null;
  onDraftChange: (draft: SsoProviderDraft) => void;
  onEdit: (draft: SsoProviderDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  modalOpen: boolean;
  onAdd: () => void;
  onModalClose: () => void;
}) {
  const providerUnit = settings.units.authProvider;
  const [callbackCopyStatus, setCallbackCopyStatus] = useState<string | null>(null);

  async function copyCallbackUrl(callbackUrl: string | null) {
    if (!callbackUrl) {
      return;
    }
    try {
      await navigator.clipboard?.writeText(callbackUrl);
      setCallbackCopyStatus("Callback URL copied.");
    } catch {
      setCallbackCopyStatus("Browser denied clipboard access. Callback URL remains visible for manual copy.");
    }
  }

  return (
    <Card>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <Text fw={700}>External SSO Providers</Text>
            <Badge color={unitStatusColor(providerUnit.status)} variant="light">
              {providerUnit.status}
            </Badge>
          </Group>
          <Button size="xs" leftSection={<Plus size={14} aria-hidden="true" />} onClick={onAdd}>
            Add provider
          </Button>
        </Group>

        {providerUnit.providers.length === 0 ? (
          <Text size="sm" c="dimmed">No external SSO providers configured.</Text>
        ) : (
          <Stack gap="sm">
            {providerUnit.providers.map((provider) => (
              <Card key={provider.id} withBorder>
                <Stack gap="xs">
                  <Group justify="space-between" align="flex-start">
                    <Stack gap={2}>
                      <Group gap="xs">
                        <Text fw={700}>{provider.displayName}</Text>
                        <Badge color="blue" variant="light">{presetLabel(provider.preset)}</Badge>
                        <Badge color={unitStatusColor(provider.status)} variant="light">{provider.status}</Badge>
                      </Group>
                      <Text size="sm" c="dimmed">{provider.providerId}</Text>
                    </Stack>
                    <Group gap="xs">
                      <Tooltip label={provider.enabled ? "Disable provider" : "Enable provider"}>
                        <Switch
                          aria-label={`${provider.displayName} enabled`}
                          checked={provider.enabled}
                          disabled={pending === provider.id}
                          onChange={(event) => onToggle(provider.id, event.currentTarget.checked)}
                        />
                      </Tooltip>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => onEdit(providerToDraft(provider))}
                      >
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        color="red"
                        variant="light"
                        loading={pending === provider.id}
                        leftSection={<Trash2 size={14} aria-hidden="true" />}
                        onClick={() => onDelete(provider.id)}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Group>

                  <ResponsiveGrid minWidth={220} gap="xs">
                    <SignalFact label="Protocol" value={provider.protocol === "oidc" ? "OpenID Connect" : "OAuth 2.0"} />
                    <SignalFact label="Client ID" value={provider.clientId ?? "not configured"} />
                    <SignalFact label="Client secret" value={provider.clientSecretConfigured ? "configured" : "not configured"} />
                    <SignalFact label="Admin rules" value={`${provider.adminEmailAllowlist.length + (provider.adminClaim ? 1 : 0)} configured`} />
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
                        onClick={() => void copyCallbackUrl(provider.callbackUrl)}
                      >
                        Copy callback URL
                      </Button>
                    </Group>
                  </Box>
                  {provider.missing.length > 0 || provider.invalid.length > 0 ? (
                    <Text size="sm" c="red.7">
                      Needs {[...provider.missing, ...provider.invalid].join(", ")}.
                    </Text>
                  ) : null}
                </Stack>
              </Card>
            ))}
          </Stack>
        )}

        {callbackCopyStatus ? <Text size="xs" c="dimmed">{callbackCopyStatus}</Text> : null}

        <Modal opened={modalOpen} onClose={onModalClose} title={editingId ? "Edit SSO provider" : "Add SSO provider"} size="lg">
          <Stack gap="sm">
            <ResponsiveGrid minWidth={240} gap="sm">
              <NativeSelect
                label="Provider preset"
                value={draft.preset}
                data={ssoProviderPresetOptions.map((preset) => ({ value: preset.value, label: preset.label }))}
                onChange={(event) => onDraftChange(applyProviderPreset(draft, event.currentTarget.value as SsoProviderPreset))}
              />
              <TextInput
                label="Provider ID"
                value={draft.providerId}
                placeholder="google-workspace"
                onChange={(event) => onDraftChange({ ...draft, providerId: event.currentTarget.value })}
              />
              <TextInput
                label="Display name"
                value={draft.displayName}
                placeholder="Google Workspace"
                onChange={(event) => onDraftChange({ ...draft, displayName: event.currentTarget.value })}
              />
              <TextInput
                label="Button label"
                value={draft.buttonLabel}
                placeholder="Continue with Google Workspace"
                onChange={(event) => onDraftChange({ ...draft, buttonLabel: event.currentTarget.value })}
              />
              <TextInput
                label="Discovery URL or Issuer URL"
                value={draft.discoveryUrl}
                onChange={(event) => onDraftChange({ ...draft, discoveryUrl: event.currentTarget.value })}
              />
              {draft.protocol === "oauth2" ? (
                <>
                  <TextInput
                    label="Authorization URL"
                    value={draft.authorizationUrl}
                    onChange={(event) => onDraftChange({ ...draft, authorizationUrl: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Token URL"
                    value={draft.tokenUrl}
                    onChange={(event) => onDraftChange({ ...draft, tokenUrl: event.currentTarget.value })}
                  />
                  <TextInput
                    label="User info URL"
                    value={draft.userInfoUrl}
                    onChange={(event) => onDraftChange({ ...draft, userInfoUrl: event.currentTarget.value })}
                  />
                </>
              ) : null}
              <TextInput
                label="Client ID"
                value={draft.clientId}
                onChange={(event) => onDraftChange({ ...draft, clientId: event.currentTarget.value })}
              />
              <PasswordInput
                label={editingId ? "New client secret" : "Client secret"}
                placeholder={editingId ? "Current secret stays configured" : undefined}
                value={draft.clientSecret}
                onChange={(event) => onDraftChange({ ...draft, clientSecret: event.currentTarget.value })}
              />
              <TextInput
                label="Scopes"
                value={draft.scopes}
                onChange={(event) => onDraftChange({ ...draft, scopes: event.currentTarget.value })}
              />
              <NumberInput
                label="Sort order"
                value={draft.sortOrder}
                allowDecimal={false}
                onChange={(value) => onDraftChange({ ...draft, sortOrder: typeof value === "number" ? value : 0 })}
              />
              <Switch
                label="Enabled"
                checked={draft.enabled}
                onChange={(event) => onDraftChange({ ...draft, enabled: event.currentTarget.checked })}
              />
            </ResponsiveGrid>
            <Textarea
              label="Admin email allowlist"
              minRows={2}
              value={draft.adminEmailAllowlist}
              onChange={(event) => onDraftChange({ ...draft, adminEmailAllowlist: event.currentTarget.value })}
            />
            <ResponsiveGrid minWidth={240} gap="sm">
              <TextInput
                label="Admin claim"
                value={draft.adminClaim}
                placeholder="groups"
                onChange={(event) => onDraftChange({ ...draft, adminClaim: event.currentTarget.value })}
              />
              <TextInput
                label="Admin claim value"
                value={draft.adminClaimValue}
                placeholder="ops-admins"
                onChange={(event) => onDraftChange({ ...draft, adminClaimValue: event.currentTarget.value })}
              />
            </ResponsiveGrid>
            <Group justify="flex-end">
              <Button variant="light" color="gray" onClick={onCancel}>
                Cancel
              </Button>
              <Button leftSection={<Save size={16} aria-hidden="true" />} loading={pending === (editingId ?? "new")} onClick={onSave}>
                {editingId ? "Save provider" : "Create provider"}
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Card>
  );
}

function providerToDraft(provider: SettingsResponse["units"]["authProvider"]["providers"][number]): SsoProviderDraft {
  return {
    id: provider.id,
    providerId: provider.providerId,
    displayName: provider.displayName,
    protocol: provider.protocol,
    preset: provider.preset as SsoProviderPreset,
    buttonLabel: provider.buttonLabel,
    logoUrl: provider.logoUrl ?? "",
    discoveryUrl: provider.discoveryUrl ?? "",
    authorizationUrl: provider.authorizationUrl ?? "",
    tokenUrl: provider.tokenUrl ?? "",
    userInfoUrl: provider.userInfoUrl ?? "",
    clientId: provider.clientId ?? "",
    clientSecret: "",
    scopes: provider.scopes.join(" "),
    enabled: provider.enabled,
    sortOrder: provider.sortOrder,
    adminEmailAllowlist: provider.adminEmailAllowlist.join("\n"),
    adminClaim: provider.adminClaim ?? "",
    adminClaimValue: provider.adminClaimValue ?? "",
  };
}

function applyProviderPreset(draft: SsoProviderDraft, presetValue: SsoProviderPreset): SsoProviderDraft {
  const preset = ssoProviderPresetOptions.find((entry) => entry.value === presetValue);
  if (!preset) {
    return draft;
  }
  return {
    ...draft,
    preset: preset.value,
    protocol: preset.protocol,
    scopes: draft.scopes || preset.scopes,
    discoveryUrl: preset.discoveryUrl ?? draft.discoveryUrl,
  };
}

function presetLabel(value: string): string {
  return ssoProviderPresetOptions.find((preset) => preset.value === value)?.label ?? value;
}

function MailSourcesCard({ settings }: { settings: SettingsResponse }) {
  const sources = settings.mailSources;
  return (
    <Card>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
	          <Stack gap={4}>
	            <Text fw={700}>Gmail Workspace Ingest</Text>
	          </Stack>
          <Badge color={unitStatusColor(settings.units.mail.status)} variant="light">
            {settings.units.mail.status}
          </Badge>
        </Group>
	        <ResponsiveGrid minWidth={220} gap="xs">
	          <SignalFact label="Runnable Gmail sources" value={String(sources.filter((source) => source.provider === "gmail" && source.isActive && source.credentialConfigured).length)} />
	          <SignalFact label="Service account key" value={sources.some((source) => source.credentialConfigured) ? "configured" : "not configured"} />
	        </ResponsiveGrid>

	        {sources.length === 0 ? (
	          <Alert color="red" title="No mail sources configured">
	            Add a runnable Gmail source before ingest.
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

	        <Text size="sm" c="dimmed">{settings.units.mail.detail}</Text>
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

function SettingsGroupCard({ group, draft, saving, onDraftChange, onSave }: {
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

function SettingEditor({ setting, draftValue, onChange }: {
  setting: SettingDescriptor;
  draftValue: PatchValue | undefined;
  onChange: (value: PatchValue) => void;
}) {
  const pendingClear = draftValue === null;
  const value = draftValue !== undefined && draftValue !== null ? draftValue : setting.secret ? "" : setting.value ?? "";
  const secretStatus = pendingClear ? "Will clear saved secret" : setting.displayValue;

  return (
    <Box>
      <Group justify="space-between" gap="xs" align="flex-start">
        <Stack gap={4} maw={520}>
          <Group gap={6}>
            <Text fw={700}>{setting.label}</Text>
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
          {setting.secret ? (
            <Text size="xs" c={setting.state === "missing" ? "red.7" : "dimmed"}>
              Current secret: {secretStatus}
            </Text>
          ) : null}
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
        label="New secret"
        placeholder="Leave blank to unset"
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

function buildOverviewUnits(settings: SettingsResponse): Array<{
  label: string;
  status: "Ready" | "Needs attention" | "Disabled";
  detail: string;
  action: string;
}> {
  return [
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
      action: "Add a runnable Gmail source.",
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

function summarizeActionTitle(action: SettingsActionName): string {
  return action === "test-gmail" ? "Mail source check finished" : "Juno session check finished";
}

function findSetting(settings: SettingsResponse, key: string): SettingDescriptor | undefined {
  return settings.groups.flatMap((group) => group.settings).find((setting) => setting.key === key);
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
