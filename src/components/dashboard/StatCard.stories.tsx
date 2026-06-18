import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MailSearch } from "lucide-react";
import { StatCard } from "./StatCard";

const meta = {
  title: "Dashboard/StatCard",
  component: StatCard,
  args: {
    label: "Mailbox",
    value: "Configured",
    detail: "configured mail source access",
    icon: MailSearch,
  },
} satisfies Meta<typeof StatCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
