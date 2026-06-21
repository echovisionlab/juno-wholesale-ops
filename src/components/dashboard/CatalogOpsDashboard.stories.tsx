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
type StoryContext = Parameters<NonNullable<Story["play"]>>[0];

export const Default: Story = {};

export const SavedViewsReadyForReview: Story = {
  args: {
    ...dashboardFixture,
    onCreateDashboardSavedView: () => undefined,
    onUpdateDashboardSavedView: () => undefined,
    onDeleteDashboardSavedView: () => undefined,
  },
};

export const SavedViewActionPending: Story = {
  args: {
    ...dashboardFixture,
    dashboardSavedViewActionPending: true,
    onCreateDashboardSavedView: () => undefined,
    onUpdateDashboardSavedView: () => undefined,
    onDeleteDashboardSavedView: () => undefined,
  },
};

export const MovementFilterActive: Story = {
  args: {
    ...dashboardFixture,
    onCreateDashboardSavedView: () => undefined,
    onUpdateDashboardSavedView: () => undefined,
    onDeleteDashboardSavedView: () => undefined,
  },
  play: async (context) => {
    await clickControl(context, "Movement");
  },
};

export const FilteredEmptyReviewQueue: Story = {
  args: {
    ...dashboardFixture,
    todaySignals: [
      {
        ...dashboardFixture.todaySignals![0],
        signalId: "signal-new-arrival",
        type: "new_arrival",
        severity: "info",
        score: 1,
        title: "New arrival: Lara Voss - Signal Path",
        detail: "New catalog row observed in the latest synthetic snapshot.",
        item: {
          ...dashboardFixture.todaySignals![0].item,
          stock: 12,
        },
      },
    ],
    movementSignals: [],
    dashboardSavedViews: [
      {
        id: "dashboard-view-low-stock-empty",
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
  play: async (context) => {
    await clickControl(context, "Low stock");
  },
};

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

async function clickControl(context: StoryContext, label: string): Promise<void> {
  await settle();
  const root = context.canvasElement.ownerDocument.body;
  const control = root.querySelector(`[aria-label="${label}"]`);
  if (!(control instanceof HTMLElement)) {
    throw new Error(`Could not find control "${label}".`);
  }
  control.click();
  await settle();
}

async function settle(): Promise<void> {
  await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
}
