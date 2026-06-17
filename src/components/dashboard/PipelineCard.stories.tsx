import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PipelineCard } from "./PipelineCard";

const meta = {
  title: "Dashboard/PipelineCard",
  component: PipelineCard,
  args: {
    title: "Normalize",
    body: "Extract source fields, pricing, stock, release dates, and deterministic hashes.",
    status: "Ready",
  },
} satisfies Meta<typeof PipelineCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
