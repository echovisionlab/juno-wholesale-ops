import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LoginForm } from "./LoginForm";

const meta = {
  title: "Feature/Auth/LoginForm",
  component: LoginForm,
  args: {
    redirectTo: "/",
    loginLogoUrl: null,
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
