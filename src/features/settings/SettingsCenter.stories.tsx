import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SettingsCenter } from "./SettingsCenter";
import {
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

export const Configured: Story = {
  args: {
    initialSettings: settingsFixture(),
    initialError: null,
  },
};

export const MissingMailSource: Story = {
  args: {
    initialSettings: settingsMissingMailSourceFixture(),
    initialError: null,
  },
};

export const SsoProviderNeedsSecret: Story = {
  args: {
    initialSettings: settingsInvalidSsoFixture(),
    initialError: null,
  },
};

export const LoadError: Story = {
  args: {
    initialSettings: null,
    initialError: "Settings API unavailable.",
  },
};
