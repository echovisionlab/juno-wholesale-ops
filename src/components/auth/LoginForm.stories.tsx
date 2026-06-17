import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LoginForm } from "./LoginForm";

const meta = {
  title: "Auth/LoginForm",
  component: LoginForm,
  args: {
    redirectTo: "/",
  },
} satisfies Meta<typeof LoginForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
