import { Badge, Button, Card, Group, Stack, Text } from "@mantine/core";
import type { SettingsGroup, SettingsResponse } from "@/lib/settings/descriptors";
import { ResponsiveGrid, SignalFact } from "./settings-layout";
import { findGroupSetting, unitStatusColor } from "./settings-utils";

export function JunoLiveSessionCard({
  settings,
  group,
  pending,
  onTest,
}: {
  settings: SettingsResponse;
  group: SettingsGroup;
  pending: boolean;
  onTest: () => void;
}) {
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
          <Text fw={700}>Juno Live Session</Text>
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
        <Group>
          <Button size="xs" variant="light" loading={pending} onClick={onTest}>
            Test session
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
