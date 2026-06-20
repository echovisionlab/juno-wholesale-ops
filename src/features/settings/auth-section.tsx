import { useState } from "react";
import { Badge, Box, Button, Card, Code, Group, Modal, NativeSelect, NumberInput, PasswordInput, Stack, Switch, Text, Textarea, TextInput, Tooltip } from "@mantine/core";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import type { SettingsResponse } from "@/lib/settings/descriptors";
import type { SsoProviderDraft, SsoProviderPreset } from "./settings-types";
import { ssoProviderPresetOptions } from "./settings-options";
import { ResponsiveGrid, SignalFact } from "./settings-layout";
import { applyProviderPreset, findSetting, formatAdminCount, normalizeOrigin, presetLabel, providerToDraft, unitStatusColor } from "./settings-utils";

export function AuthAccessCards({ settings }: { settings: SettingsResponse }) {
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
        </Stack>
      </Card>

      <Card>
        <Stack gap="xs">
          <Text fw={700}>Sign-in Methods</Text>
          <SignalFact label="Email/password login" value={localLogin?.displayValue ?? "enabled"} />
          <SignalFact label="External SSO providers" value={`${authProvider.readyProviderCount} ready / ${authProvider.enabledProviderCount} enabled / ${authProvider.providerCount} total`} />
        </Stack>
      </Card>
    </ResponsiveGrid>
  );
}

export function AuthProviderCard({
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

        <Modal opened={modalOpen} onClose={onModalClose} title={editingId ? "Edit SSO provider" : "Add SSO provider"} size="lg" transitionProps={{ duration: 0 }}>
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
                placeholder={editingId ? "Leave blank to keep configured" : undefined}
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
