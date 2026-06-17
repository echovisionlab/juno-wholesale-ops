import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MailSearch } from "lucide-react";
import { StatCard } from "./StatCard";

const meta = {
  title: "Dashboard/StatCard",
  component: StatCard,
  args: {
    label: "Mailbox",
    value: "state303@dsub.io",
    detail: "delegated Gmail access",
    icon: MailSearch,
  },
} satisfies Meta<typeof StatCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
