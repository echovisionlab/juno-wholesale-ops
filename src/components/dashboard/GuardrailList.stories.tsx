import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GuardrailList } from "./GuardrailList";

const meta = {
  title: "Dashboard/GuardrailList",
  component: GuardrailList,
  args: {
    items: [
      "Never commit Google service account JSON.",
      "Dry-run Gmail ingestion before writing Postgres rows.",
      "Keep wholesale tables outside the another application schema.",
    ],
  },
} satisfies Meta<typeof GuardrailList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
