import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LoginForm } from "./LoginForm";

const meta = {
  title: "Feature/Auth/LoginForm",
  component: LoginForm,
  args: {
    redirectTo: "/",
    loginLogoUrl: null,
    emailPasswordLoginEnabled: true,
    externalProviders: [],
  },
} satisfies Meta<typeof LoginForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithExternalProvider: Story = {
  args: {
    externalProviders: [
      {
        providerId: "workspace",
        buttonLabel: "Sign in with Workspace",
        logoUrl: null,
      },
    ],
  },
};

export const SsoOnly: Story = {
  args: {
    emailPasswordLoginEnabled: false,
    externalProviders: [
      {
        providerId: "workspace",
        buttonLabel: "Sign in with Workspace",
        logoUrl: null,
      },
      {
        providerId: "entra",
        buttonLabel: "Sign in with Entra ID",
        logoUrl: null,
      },
    ],
  },
};

export const MethodsUnavailable: Story = {
  args: {
    emailPasswordLoginEnabled: false,
    externalProviders: [],
  },
};
