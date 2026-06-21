import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SettingsCenter } from "./SettingsCenter";
import {
  notificationChannelFixture,
  notificationRuleFixture,
  settingsFixture,
  settingsInvalidSsoFixture,
  settingsMissingMailSourceFixture,
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

export const Default: Story = {
  args: {
    initialSettings: settingsFixture(),
    initialError: null,
  },
};

export const NeedsMailSource: Story = {
  args: {
    initialSettings: settingsMissingMailSourceFixture(),
    initialError: null,
    initialTab: "mail",
  },
};

export const SsoProviderNeedsSecret: Story = {
  args: {
    initialSettings: settingsInvalidSsoFixture(),
    initialError: null,
    initialTab: "auth",
  },
};

export const Notifications: Story = {
  args: {
    initialSettings: settingsFixture(),
    initialError: null,
    initialTab: "notifications",
    initialNotificationChannels: [notificationChannelFixture()],
    initialNotificationRules: [notificationRuleFixture()],
  },
};

export const LoadError: Story = {
  args: {
    initialSettings: null,
    initialError: "Settings API unavailable.",
  },
};
