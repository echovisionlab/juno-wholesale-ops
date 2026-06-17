import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CatalogOpsDashboard } from "./CatalogOpsDashboard";
import { dashboardFixture } from "./dashboard.fixtures";

const meta = {
  title: "Dashboard/CatalogOpsDashboard",
  component: CatalogOpsDashboard,
  args: dashboardFixture,
} satisfies Meta<typeof CatalogOpsDashboard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
