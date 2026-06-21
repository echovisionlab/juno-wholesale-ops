import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SettingsCenter } from "./SettingsCenter";
import {
  notificationDigestRuleFixture,
  notificationDisabledChannelFixture,
  notificationChannelFixture,
  notificationMutedRuleFixture,
  notificationRuleFixture,
  notificationWebhookChannelFixture,
  settingsFixture,
  settingsInvalidSsoFixture,
  settingsJunoLiveReadyFixture,
  settingsJunoLiveWarningFixture,
  settingsMailPlannedProviderFixture,
  settingsMissingMailSourceFixture,
  settingsNoSsoProvidersFixture,
  settingsSsoProviderListFixture,
} from "./settings.fixtures";

const meta = {
  title: "Feature/Settings/SettingsCenter",
  component: SettingsCenter,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof SettingsCenter>;

export default meta;

type Story = StoryObj<typeof meta>;
type StoryContext = Parameters<NonNullable<Story["play"]>>[0];

export const Default: Story = {
  args: {
    initialSettings: settingsFixture(),
    initialError: null,
  },
};

export const AuthSsoProvidersList: Story = {
  args: {
    initialSettings: settingsSsoProviderListFixture(),
    initialError: null,
    initialTab: "auth",
  },
};

export const AuthSsoEmptyList: Story = {
  args: {
    initialSettings: settingsNoSsoProvidersFixture(),
    initialError: null,
    initialTab: "auth",
  },
};

export const AuthSsoAddDialog: Story = {
  args: {
    initialSettings: settingsNoSsoProvidersFixture(),
    initialError: null,
    initialTab: "auth",
  },
  play: async (context) => {
    await clickButton(context, "Add provider");
  },
};

export const AuthSsoEditDialog: Story = {
  args: {
    initialSettings: settingsSsoProviderListFixture(),
    initialError: null,
    initialTab: "auth",
  },
  play: async (context) => {
    await clickButton(context, "Edit");
  },
};

export const AuthSsoProviderNeedsSecret: Story = {
  args: {
    initialSettings: settingsInvalidSsoFixture(),
    initialError: "Add a client secret reference before enabling this provider.",
    initialTab: "auth",
  },
};

export const MailSourcesList: Story = {
  args: {
    initialSettings: settingsFixture(),
    initialError: null,
    initialTab: "mail",
  },
};

export const MailSourcesMissingActiveSource: Story = {
  args: {
    initialSettings: settingsMissingMailSourceFixture(),
    initialError: null,
    initialTab: "mail",
  },
};

export const MailSourceAddDialog: Story = {
  args: {
    initialSettings: settingsMissingMailSourceFixture(),
    initialError: null,
    initialTab: "mail",
  },
  play: async (context) => {
    await clickButton(context, "Add source");
  },
};

export const MailSourceEditDialog: Story = {
  args: {
    initialSettings: settingsFixture(),
    initialError: null,
    initialTab: "mail",
  },
  play: async (context) => {
    await clickButton(context, "Edit");
  },
};

export const MailSourceConnectionTestFailed: Story = {
  args: {
    initialSettings: settingsFixture(),
    initialError: null,
    initialTab: "mail",
  },
  play: async (context) => {
    const restoreFetch = installMailSourceTestMock(context, {
      ok: false,
      status: "credential_missing",
      provider: "gmail",
      mailboxAddress: "operator@example.test",
      query: "filename:xlsx",
      missing: ["credential_secret"],
    });
    await clickButton(context, "Edit");
    await clickButton(context, "Test connection");
    await waitForText(context, "Connection test failed");
    restoreFetch();
  },
};

export const MailSourcePlannedProvider: Story = {
  args: {
    initialSettings: settingsMailPlannedProviderFixture(),
    initialError: null,
    initialTab: "mail",
  },
};

export const MailSourcePlannedProviderEditDialog: Story = {
  args: {
    initialSettings: settingsMailPlannedProviderFixture(),
    initialError: null,
    initialTab: "mail",
  },
  play: async (context) => {
    await clickButton(context, "Edit", 1);
  },
};

export const JunoLiveReady: Story = {
  args: {
    initialSettings: settingsJunoLiveReadyFixture(),
    initialError: null,
    initialTab: "juno",
  },
};

export const JunoLiveDisabledUntilCredentials: Story = {
  args: {
    initialSettings: settingsFixture(),
    initialError: null,
    initialTab: "juno",
  },
};

export const JunoLiveNeedsPacingReview: Story = {
  args: {
    initialSettings: settingsJunoLiveWarningFixture(),
    initialError: "Juno session check finished, but pacing settings need attention.",
    initialTab: "juno",
  },
};

export const NotificationChannelsAndRules: Story = {
  args: {
    initialSettings: settingsFixture(),
    initialError: null,
    initialTab: "notifications",
    initialNotificationChannels: [
      notificationChannelFixture(),
      notificationWebhookChannelFixture(),
      notificationDisabledChannelFixture(),
    ],
    initialNotificationRules: [
      notificationRuleFixture(),
      notificationDigestRuleFixture(),
      notificationMutedRuleFixture(),
    ],
  },
};

export const NotificationEmptyState: Story = {
  args: {
    initialSettings: settingsFixture(),
    initialError: null,
    initialTab: "notifications",
    initialNotificationChannels: [],
    initialNotificationRules: [],
  },
};

export const NotificationChannelAddDialog: Story = {
  args: {
    initialSettings: settingsFixture(),
    initialError: null,
    initialTab: "notifications",
    initialNotificationChannels: [notificationChannelFixture()],
    initialNotificationRules: [notificationRuleFixture()],
  },
  play: async (context) => {
    await clickButton(context, "Add channel");
  },
};

export const NotificationRuleEditDialog: Story = {
  args: {
    initialSettings: settingsFixture(),
    initialError: null,
    initialTab: "notifications",
    initialNotificationChannels: [notificationChannelFixture(), notificationWebhookChannelFixture()],
    initialNotificationRules: [notificationRuleFixture(), notificationDigestRuleFixture()],
  },
  play: async (context) => {
    await clickButton(context, "Edit", 2);
  },
};

export const LoadError: Story = {
  args: {
    initialSettings: null,
    initialError: "Settings API unavailable.",
  },
};

function installMailSourceTestMock(
  context: StoryContext,
  test: {
    ok: boolean;
    status: string;
    provider: string;
    mailboxAddress: string;
    query: string;
    missing?: string[];
    error?: string;
  },
): () => void {
  const storyWindow = context.canvasElement.ownerDocument.defaultView ?? window;
  const originalFetch = storyWindow.fetch;
  storyWindow.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/api/mail-sources/test")) {
      return new Response(JSON.stringify({ test }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  return () => {
    storyWindow.fetch = originalFetch;
  };
}

async function clickButton(context: StoryContext, label: string, index = 0): Promise<void> {
  await settle();
  const button = findButtons(context, label)[index];
  if (!button) {
    throw new Error(`Could not find button "${label}".`);
  }
  button.click();
  await settle();
}

async function waitForText(context: StoryContext, text: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (context.canvasElement.ownerDocument.body.textContent?.includes(text)) {
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error(`Could not find text "${text}".`);
}

function findButtons(context: StoryContext, label: string): HTMLButtonElement[] {
  const root = context.canvasElement.ownerDocument.body;
  return [...root.querySelectorAll("button")]
    .filter((button): button is HTMLButtonElement => {
      const buttonLabel = button.getAttribute("aria-label") ?? button.textContent ?? "";
      return buttonLabel.trim() === label;
    });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
}
