import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CatalogOpsDashboard } from "./CatalogOpsDashboard";
import { dashboardFixture } from "./dashboard.fixtures";

const meta = {
  title: "Feature/Dashboard/CatalogOpsDashboard",
  component: CatalogOpsDashboard,
  args: dashboardFixture,
} satisfies Meta<typeof CatalogOpsDashboard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const EmptySignalsWithSavedViews: Story = {
  args: {
    ...dashboardFixture,
    todaySignals: [],
    movementSignals: [],
    dashboardSavedViews: [
      {
        id: "dashboard-view-empty",
        name: "Low stock review",
        filters: {
          signalTypes: [],
          severities: ["warning", "critical"],
          watchHitsOnly: false,
          lowStockOnly: true,
          movementOnly: false,
          dateRange: "7d",
        },
        sortOrder: 0,
        createdAt: "2026-06-17T00:00:00.000Z",
        updatedAt: "2026-06-17T00:00:00.000Z",
      },
    ],
  },
};
