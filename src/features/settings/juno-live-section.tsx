import { Button, Card, Group, Stack, Text } from "@mantine/core";
import type { SettingsGroup } from "@/lib/settings/descriptors";
import { ResponsiveGrid, SignalFact } from "./settings-layout";
import { findGroupSetting } from "./settings-utils";

export function JunoLiveSessionCard({
  group,
  pending,
  onTest,
}: {
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
  const loginReady = loginEmail?.state === "configured" && loginPassword?.state === "configured";
  const autoEnqueueEnabled = autoEnqueue?.value === true;

  return (
    <Card>
      <Stack gap="sm">
        <Text fw={700}>Juno Live Session</Text>
        <ResponsiveGrid minWidth={220} gap="xs">
          <SignalFact label="Poll interval" value={pollInterval?.displayValue ?? "manual only"} />
          <SignalFact label="Concurrency" value={concurrency?.displayValue ?? "Default value"} />
          <SignalFact label="Delay window" value={`${delayMin?.displayValue ?? "Default value"} to ${delayMax?.displayValue ?? "Default value"}`} />
          <SignalFact label="Auto enqueue" value={autoEnqueueEnabled ? "Interval enqueue" : "Manual only"} />
        </ResponsiveGrid>
        {!loginReady ? (
          <Text size="sm" c="red.7">
            Save login email and password before testing the session.
          </Text>
        ) : null}
        <Group>
          <Button size="xs" variant="light" loading={pending} disabled={!loginReady} onClick={onTest}>
            Test session
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
