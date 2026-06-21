import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdmin } from "@/lib/auth/admin";
import { GOOGLE_GMAIL_READONLY_SCOPE } from "@/lib/env";
import {
  createSsoProvider,
  deleteSsoProvider,
  listSsoProviders,
  updateSsoProvider,
} from "@/lib/auth/sso-provider-repository";
import {
  createMailboxSource,
  deleteMailboxSource,
  listActiveMailboxSources,
  listMailboxSources,
  updateMailboxSource,
} from "@/lib/ingest/mail-source";
import { testMailboxSourceConnection } from "@/lib/ingest/mail-source-test";
import { GmailClient } from "@/lib/ingest/gmail";
import { getDelegatedAccessToken, parseServiceAccountKeyJson } from "@/lib/ingest/google-auth";
import { getGmailIngestState } from "@/lib/ingest/repository";
import {
  createDashboardSavedView,
  deleteDashboardSavedView,
  listDashboardSavedViews,
  updateDashboardSavedView,
} from "@/lib/dashboard/saved-views-repository";
import {
  createWatchRule,
  deleteWatchRule,
  getTodaySignals,
  listWatchRules,
  updateWatchRule,
} from "@/lib/insights/repository";
import { getMovementSignals } from "@/lib/insights/movement-repository";
import { getCatalogTrends, getInsightDigest } from "@/lib/insights/trend-repository";
import { enqueueLiveLookupJobs, withJunoLiveRepository } from "@/lib/juno-live/repository";
import { getJunoLiveWorkerProcessManager } from "@/lib/juno-live/worker-process";
import { dispatchQueuedNotifications } from "@/lib/notifications/dispatcher";
import {
  createNotificationChannel,
  createNotificationRule,
  deleteNotificationChannel,
  deleteNotificationRule,
  listNotificationChannels,
  listNotificationDeliveries,
  listNotificationRules,
  matchNotificationRulesForSignals,
  updateNotificationChannel,
  updateNotificationRule,
} from "@/lib/notifications/repository";
import { countAdminUsers, ensureServiceSettingsRow, updateServiceSettings } from "@/lib/settings/repository";
import type { ServiceSettingsRow } from "@/lib/settings/descriptors";
import { POST as enqueueLiveLookups } from "./live-lookups/enqueue/route";
import { GET as getLiveLookupStatus } from "./live-lookups/status/route";
import {
  GET as getLiveLookupWorker,
  POST as postLiveLookupWorker,
} from "./live-lookups/worker/route";
import { GET as getIngestStatus } from "./ingest/status/route";
import { GET as getTodayInsights } from "./insights/today/route";
import { GET as getDigestInsights } from "./insights/digest/route";
import { GET as getMovementInsights } from "./insights/movement/route";
import { GET as getTrendInsights } from "./insights/trends/route";
import { GET as getSettingsStatus } from "./settings/status/route";
import { GET as getSettings, PATCH as patchSettings } from "./settings/route";
import { GET as getSettingsSecurityBootstrap } from "./settings/security/bootstrap/route";
import {
  DELETE as deleteSettingsSsoProviders,
  GET as getSettingsSsoProviders,
  PATCH as patchSettingsSsoProviders,
  POST as postSettingsSsoProviders,
} from "./settings/auth/sso-providers/route";
import { POST as testGmailSettings } from "./settings/actions/test-gmail/route";
import { POST as testJunoSessionSettings } from "./settings/actions/test-juno-session/route";
import {
  DELETE as deleteNotificationChannels,
  GET as getNotificationChannels,
  PATCH as patchNotificationChannels,
  POST as postNotificationChannels,
} from "./notifications/channels/route";
import { GET as getNotificationDeliveries } from "./notifications/deliveries/route";
import { POST as dispatchNotifications } from "./notifications/dispatch/route";
import { POST as queueNotifications } from "./notifications/queue/route";
import { POST as refreshNotifications } from "./notifications/refresh/route";
import {
  DELETE as deleteNotificationRules,
  GET as getNotificationRules,
  PATCH as patchNotificationRules,
  POST as postNotificationRules,
} from "./notifications/rules/route";
import {
  DELETE as deleteWatchRules,
  GET as getWatchRules,
  PATCH as patchWatchRules,
  POST as postWatchRules,
} from "./watch-rules/route";
import {
  DELETE as deleteMailSources,
  GET as getMailSources,
  PATCH as patchMailSources,
  POST as postMailSources,
} from "./mail-sources/route";
import { POST as postMailSourcesTest } from "./mail-sources/test/route";
import {
  DELETE as deleteDashboardSavedViews,
  GET as getDashboardSavedViews,
  PATCH as patchDashboardSavedViews,
  POST as postDashboardSavedViews,
} from "./dashboard/saved-views/route";

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/sso-provider-repository", () => ({
  createSsoProvider: vi.fn(),
  deleteSsoProvider: vi.fn(),
  listSsoProviders: vi.fn(),
  redactSsoProvider: vi.fn((provider) => provider),
  updateSsoProvider: vi.fn(),
  validateSsoProviderInput: vi.fn(() => []),
}));

vi.mock("@/lib/ingest/repository", () => ({
  getGmailIngestState: vi.fn(),
}));

vi.mock("@/lib/dashboard/saved-views-repository", () => ({
  createDashboardSavedView: vi.fn(),
  deleteDashboardSavedView: vi.fn(),
  listDashboardSavedViews: vi.fn(),
  updateDashboardSavedView: vi.fn(),
}));

vi.mock("@/lib/ingest/mail-source", () => ({
  createMailboxSource: vi.fn(),
  deleteMailboxSource: vi.fn(),
  getMissingMailboxSourceSettings: vi.fn(() => []),
  getRunnableGmailSources: vi.fn((sources) => sources.filter((source: { provider: string; credentialConfigured: boolean }) => source.provider === "gmail" && source.credentialConfigured)),
  listActiveMailboxSources: vi.fn(async () => []),
  listMailboxSources: vi.fn(),
  redactMailboxSource: vi.fn((source) => {
    const publicSource = { ...(source as Record<string, unknown>) };
    delete publicSource.credentialSecret;
    return publicSource;
  }),
  updateMailboxSource: vi.fn(),
}));

vi.mock("@/lib/ingest/mail-source-test", () => ({
  testMailboxSourceConnection: vi.fn(),
}));

vi.mock("@/lib/ingest/gmail", () => ({
  GmailClient: vi.fn(function GmailClientMock() {
    return {
      listMessages: vi.fn(async () => []),
    };
  }),
}));

vi.mock("@/lib/ingest/google-auth", () => ({
  getDelegatedAccessToken: vi.fn(async () => "gmail-access-token"),
  parseServiceAccountKeyJson: vi.fn(() => ({ client_email: "service@example.test", private_key: "key" })),
}));

vi.mock("@/lib/insights/repository", () => ({
  createWatchRule: vi.fn(),
  deleteWatchRule: vi.fn(),
  getTodaySignals: vi.fn(),
  listWatchRules: vi.fn(),
  updateWatchRule: vi.fn(),
}));

vi.mock("@/lib/insights/movement-repository", () => ({
  getMovementSignals: vi.fn(),
}));

vi.mock("@/lib/insights/trend-repository", () => ({
  getCatalogTrends: vi.fn(),
  getInsightDigest: vi.fn(),
}));

vi.mock("@/lib/juno-live/repository", () => ({
  enqueueLiveLookupJobs: vi.fn(),
  withJunoLiveRepository: vi.fn(),
}));

vi.mock("@/lib/juno-live/worker-process", () => ({
  getJunoLiveWorkerProcessManager: vi.fn(),
}));

vi.mock("@/lib/notifications/dispatcher", () => ({
  dispatchQueuedNotifications: vi.fn(),
}));

vi.mock("@/lib/notifications/repository", () => ({
  createNotificationChannel: vi.fn(),
  createNotificationRule: vi.fn(),
  deleteNotificationChannel: vi.fn(),
  deleteNotificationRule: vi.fn(),
  listNotificationChannels: vi.fn(),
  listNotificationDeliveries: vi.fn(),
  listNotificationRules: vi.fn(),
  matchNotificationRulesForSignals: vi.fn(),
  updateNotificationChannel: vi.fn(),
  updateNotificationRule: vi.fn(),
}));

vi.mock("@/lib/settings/repository", () => ({
  countAdminUsers: vi.fn(),
  ensureServiceSettingsRow: vi.fn(),
  updateServiceSettings: vi.fn(),
}));

const requireAdminMock = vi.mocked(requireAdmin);
const createSsoProviderMock = vi.mocked(createSsoProvider);
const deleteSsoProviderMock = vi.mocked(deleteSsoProvider);
const listSsoProvidersMock = vi.mocked(listSsoProviders);
const updateSsoProviderMock = vi.mocked(updateSsoProvider);
const createMailboxSourceMock = vi.mocked(createMailboxSource);
const deleteMailboxSourceMock = vi.mocked(deleteMailboxSource);
const listActiveMailboxSourcesMock = vi.mocked(listActiveMailboxSources);
const listMailboxSourcesMock = vi.mocked(listMailboxSources);
const updateMailboxSourceMock = vi.mocked(updateMailboxSource);
const testMailboxSourceConnectionMock = vi.mocked(testMailboxSourceConnection);
const gmailClientMock = vi.mocked(GmailClient);
const getDelegatedAccessTokenMock = vi.mocked(getDelegatedAccessToken);
const parseServiceAccountKeyJsonMock = vi.mocked(parseServiceAccountKeyJson);
const getGmailIngestStateMock = vi.mocked(getGmailIngestState);
const listDashboardSavedViewsMock = vi.mocked(listDashboardSavedViews);
const createDashboardSavedViewMock = vi.mocked(createDashboardSavedView);
const updateDashboardSavedViewMock = vi.mocked(updateDashboardSavedView);
const deleteDashboardSavedViewMock = vi.mocked(deleteDashboardSavedView);
const getTodaySignalsMock = vi.mocked(getTodaySignals);
const getMovementSignalsMock = vi.mocked(getMovementSignals);
const getCatalogTrendsMock = vi.mocked(getCatalogTrends);
const getInsightDigestMock = vi.mocked(getInsightDigest);
const listWatchRulesMock = vi.mocked(listWatchRules);
const createWatchRuleMock = vi.mocked(createWatchRule);
const updateWatchRuleMock = vi.mocked(updateWatchRule);
const deleteWatchRuleMock = vi.mocked(deleteWatchRule);
const enqueueLiveLookupJobsMock = vi.mocked(enqueueLiveLookupJobs);
const withJunoLiveRepositoryMock = vi.mocked(withJunoLiveRepository);
const getJunoLiveWorkerProcessManagerMock = vi.mocked(getJunoLiveWorkerProcessManager);
const dispatchQueuedNotificationsMock = vi.mocked(dispatchQueuedNotifications);
const createNotificationChannelMock = vi.mocked(createNotificationChannel);
const createNotificationRuleMock = vi.mocked(createNotificationRule);
const deleteNotificationChannelMock = vi.mocked(deleteNotificationChannel);
const deleteNotificationRuleMock = vi.mocked(deleteNotificationRule);
const listNotificationChannelsMock = vi.mocked(listNotificationChannels);
const listNotificationDeliveriesMock = vi.mocked(listNotificationDeliveries);
const listNotificationRulesMock = vi.mocked(listNotificationRules);
const matchNotificationRulesForSignalsMock = vi.mocked(matchNotificationRulesForSignals);
const updateNotificationChannelMock = vi.mocked(updateNotificationChannel);
const updateNotificationRuleMock = vi.mocked(updateNotificationRule);
const ensureServiceSettingsRowMock = vi.mocked(ensureServiceSettingsRow);
const updateServiceSettingsMock = vi.mocked(updateServiceSettings);
const countAdminUsersMock = vi.mocked(countAdminUsers);

describe("admin guarded API routes", () => {
  const repository = {
    getServiceSettingsRow: vi.fn(async () => null),
    getSummary: vi.fn(async () => ({ queued: 2 })),
  };
  const manager = {
    getStatus: vi.fn(() => ({ state: "stopped" })),
    start: vi.fn(() => ({ state: "running" })),
    stopAndWait: vi.fn(async () => ({ state: "stopped" })),
    restart: vi.fn(async () => ({ state: "running", restarts: 1 })),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/app");
    requireAdminMock.mockResolvedValue({ authorized: true, user: null });
    listSsoProvidersMock.mockResolvedValue([]);
    createSsoProviderMock.mockResolvedValue({} as never);
    updateSsoProviderMock.mockResolvedValue({} as never);
    deleteSsoProviderMock.mockResolvedValue({ deleted: true });
    listActiveMailboxSourcesMock.mockResolvedValue([]);
    listMailboxSourcesMock.mockResolvedValue([]);
    createMailboxSourceMock.mockResolvedValue(mailSource());
    updateMailboxSourceMock.mockResolvedValue(mailSource());
    deleteMailboxSourceMock.mockResolvedValue(true);
    listDashboardSavedViewsMock.mockResolvedValue([]);
    createDashboardSavedViewMock.mockResolvedValue(dashboardSavedView());
    updateDashboardSavedViewMock.mockResolvedValue(dashboardSavedView());
    deleteDashboardSavedViewMock.mockResolvedValue(true);
    testMailboxSourceConnectionMock.mockResolvedValue({
      ok: true,
      status: "connection_ready",
      provider: "gmail",
      mailboxAddress: "ops@example.test",
      query: "filename:xlsx",
      messageCount: 1,
    });
    parseServiceAccountKeyJsonMock.mockReturnValue({ client_email: "service@example.test", private_key: "key" });
    getDelegatedAccessTokenMock.mockResolvedValue("gmail-access-token");
    gmailClientMock.mockImplementation(function GmailClientMock() {
      return {
        listMessages: vi.fn(async () => []),
      };
    });
    ensureServiceSettingsRowMock.mockResolvedValue(emptySettingsRow());
    updateServiceSettingsMock.mockImplementation(async () => emptySettingsRow());
    countAdminUsersMock.mockResolvedValue(1);
    withJunoLiveRepositoryMock.mockImplementation(async (_databaseUrl, callback) =>
      callback(repository as never, {} as never),
    );
    getJunoLiveWorkerProcessManagerMock.mockReturnValue(manager as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects protected routes before side effects when admin authorization fails", async () => {
    requireAdminMock.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: "admin_required" }, { status: 403 }),
    });

    await expectStatus(getIngestStatus(request()), 403);
    await expectStatus(getSettingsStatus(request()), 403);
    await expectStatus(getSettings(request()), 403);
    await expectStatus(getSettingsSecurityBootstrap(request()), 403);
    await expectStatus(getSettingsSsoProviders(request()), 403);
    await expectStatus(postSettingsSsoProviders(jsonRequest({ providerId: "workspace" })), 403);
    await expectStatus(patchSettingsSsoProviders(jsonRequest({ id: "provider-1", enabled: false })), 403);
    await expectStatus(deleteSettingsSsoProviders(jsonRequest({ id: "provider-1" })), 403);
    await expectStatus(patchSettings(jsonRequest({ auth: { auth_base_url: "https://app.example.test" } })), 403);
    await expectStatus(getMailSources(request()), 403);
    await expectStatus(postMailSources(jsonRequest({ name: "Mail", provider: "gmail" })), 403);
    await expectStatus(patchMailSources(jsonRequest({ id: "source-1", isActive: false })), 403);
    await expectStatus(deleteMailSources(jsonRequest({ id: "source-1" })), 403);
    await expectStatus(testGmailSettings(jsonRequest({ mode: "smoke" })), 403);
    await expectStatus(testJunoSessionSettings(jsonRequest({ mode: "smoke" })), 403);
    await expectStatus(getLiveLookupStatus(request()), 403);
    await expectStatus(getLiveLookupWorker(request()), 403);
    await expectStatus(postLiveLookupWorker(jsonRequest({ action: "start" })), 403);
    await expectStatus(enqueueLiveLookups(jsonRequest({ limit: 10 })), 403);
    await expectStatus(getTodayInsights(request()), 403);
    await expectStatus(getMovementInsights(request()), 403);
    await expectStatus(getTrendInsights(request()), 403);
    await expectStatus(getDigestInsights(request()), 403);
    await expectStatus(getDashboardSavedViews(request()), 403);
    await expectStatus(postDashboardSavedViews(jsonRequest({ name: "Watch hits" })), 403);
    await expectStatus(patchDashboardSavedViews(jsonRequest({ id: "view-1", name: "Warnings" })), 403);
    await expectStatus(deleteDashboardSavedViews(jsonRequest({ id: "view-1" })), 403);
    await expectStatus(getWatchRules(request()), 403);
    await expectStatus(postWatchRules(jsonRequest({ type: "artist", pattern: "Lara Voss" })), 403);
    await expectStatus(patchWatchRules(jsonRequest({ id: "rule-1", enabled: false })), 403);
    await expectStatus(deleteWatchRules(jsonRequest({ id: "rule-1" })), 403);
    await expectStatus(getNotificationDeliveries(request()), 403);
    await expectStatus(getNotificationChannels(request()), 403);
    await expectStatus(postNotificationChannels(jsonRequest({ name: "In-app", type: "in_app" })), 403);
    await expectStatus(patchNotificationChannels(jsonRequest({ id: "channel-1", enabled: false })), 403);
    await expectStatus(deleteNotificationChannels(jsonRequest({ id: "channel-1" })), 403);
    await expectStatus(getNotificationRules(request()), 403);
    await expectStatus(postNotificationRules(jsonRequest({ name: "Rule", channelId: "channel-1" })), 403);
    await expectStatus(patchNotificationRules(jsonRequest({ id: "notification-rule-1", enabled: false })), 403);
    await expectStatus(deleteNotificationRules(jsonRequest({ id: "notification-rule-1" })), 403);
    await expectStatus(queueNotifications(jsonRequest({ limit: 10 })), 403);
    await expectStatus(dispatchNotifications(jsonRequest({ mode: "send" })), 403);
    await expectStatus(refreshNotifications(jsonRequest({ mode: "dry-run" })), 403);

    expect(getGmailIngestStateMock).not.toHaveBeenCalled();
    expect(listMailboxSourcesMock).not.toHaveBeenCalled();
    expect(createMailboxSourceMock).not.toHaveBeenCalled();
    expect(updateMailboxSourceMock).not.toHaveBeenCalled();
    expect(deleteMailboxSourceMock).not.toHaveBeenCalled();
    await expectStatus(postMailSourcesTest(jsonRequest({ provider: "gmail" })), 403);
    expect(testMailboxSourceConnectionMock).not.toHaveBeenCalled();
    expect(getTodaySignalsMock).not.toHaveBeenCalled();
    expect(getMovementSignalsMock).not.toHaveBeenCalled();
    expect(getCatalogTrendsMock).not.toHaveBeenCalled();
    expect(getInsightDigestMock).not.toHaveBeenCalled();
    expect(listDashboardSavedViewsMock).not.toHaveBeenCalled();
    expect(createDashboardSavedViewMock).not.toHaveBeenCalled();
    expect(updateDashboardSavedViewMock).not.toHaveBeenCalled();
    expect(deleteDashboardSavedViewMock).not.toHaveBeenCalled();
    expect(listWatchRulesMock).not.toHaveBeenCalled();
    expect(createWatchRuleMock).not.toHaveBeenCalled();
    expect(updateWatchRuleMock).not.toHaveBeenCalled();
    expect(deleteWatchRuleMock).not.toHaveBeenCalled();
    expect(listNotificationDeliveriesMock).not.toHaveBeenCalled();
    expect(listNotificationChannelsMock).not.toHaveBeenCalled();
    expect(createNotificationChannelMock).not.toHaveBeenCalled();
    expect(updateNotificationChannelMock).not.toHaveBeenCalled();
    expect(deleteNotificationChannelMock).not.toHaveBeenCalled();
    expect(listNotificationRulesMock).not.toHaveBeenCalled();
    expect(createNotificationRuleMock).not.toHaveBeenCalled();
    expect(updateNotificationRuleMock).not.toHaveBeenCalled();
    expect(deleteNotificationRuleMock).not.toHaveBeenCalled();
    expect(matchNotificationRulesForSignalsMock).not.toHaveBeenCalled();
    expect(dispatchQueuedNotificationsMock).not.toHaveBeenCalled();
    expect(ensureServiceSettingsRowMock).not.toHaveBeenCalled();
    expect(updateServiceSettingsMock).not.toHaveBeenCalled();
    expect(listSsoProvidersMock).not.toHaveBeenCalled();
    expect(createSsoProviderMock).not.toHaveBeenCalled();
    expect(updateSsoProviderMock).not.toHaveBeenCalled();
    expect(deleteSsoProviderMock).not.toHaveBeenCalled();
    expect(withJunoLiveRepositoryMock).not.toHaveBeenCalled();
    expect(getJunoLiveWorkerProcessManagerMock).not.toHaveBeenCalled();
    expect(enqueueLiveLookupJobsMock).not.toHaveBeenCalled();
  });

  it("returns ingest state only after admin authorization", async () => {
    getGmailIngestStateMock.mockResolvedValue({ lastQueryStatus: "succeeded" } as never);

    await expect(expectJson(getIngestStatus(request()))).resolves.toEqual({
      status: 200,
      body: { state: { lastQueryStatus: "succeeded" } },
    });
    expect(getGmailIngestStateMock).toHaveBeenCalledWith("postgres://user:pass@localhost:5432/app");
  });

  it("guards settings reads, patch semantics, status, and secret masking", async () => {
    await expect(expectJson(getSettingsStatus(request()))).resolves.toMatchObject({
      status: 200,
      body: {
        setup: {
          ready: false,
        },
      },
    });
    await expect(expectJson(getSettings(request()))).resolves.toEqual({
      status: 200,
      body: expect.any(Object),
    });

    ensureServiceSettingsRowMock.mockResolvedValue({
      ...emptySettingsRow(),
      auth_base_url: "https://inventory-dev.example.test",
      juno_login_email: "buyer@example.test",
      juno_login_password: "db-juno-password",
    });

    const settingsResponse = await expectJson(getSettings(request()));
    expect(settingsResponse.status).toBe(200);
    expect(JSON.stringify(settingsResponse.body)).toContain("Saved");
    expect(JSON.stringify(settingsResponse.body)).not.toContain("db-juno-password");

    countAdminUsersMock.mockRejectedValueOnce(new Error("count failed"));
    await expect(expectJson(getSettingsStatus(request()))).resolves.toMatchObject({
      status: 200,
      body: {
        setup: {
          steps: expect.arrayContaining([
            expect.objectContaining({
              id: "auth",
              guardrails: expect.arrayContaining([
                expect.objectContaining({
                  label: "Admin bootstrap",
                  state: "warning",
                }),
              ]),
            }),
          ]),
        },
      },
    });

    await expect(expectJson(getSettingsSecurityBootstrap(request()))).resolves.toMatchObject({
      status: 200,
      body: {
        status: "ready",
        adminUserCount: 1,
      },
    });

    await expect(expectJson(patchSettings(jsonRequest({ juno: { juno_login_password: "" } })))).resolves.toMatchObject({
      status: 200,
      body: { changed: ["juno_login_password"] },
    });
    expect(updateServiceSettingsMock).toHaveBeenCalledWith("postgres://user:pass@localhost:5432/app", {
      juno_login_password: null,
    });
    updateServiceSettingsMock.mockClear();

    updateServiceSettingsMock.mockResolvedValueOnce({
      ...emptySettingsRow(),
      juno_login_email: "buyer@example.test",
      juno_login_password: null,
    });
    const clearResponse = await expectJson(patchSettings(jsonRequest({ juno: { juno_login_password: null } })));
    expect(clearResponse.status).toBe(200);
    expect(updateServiceSettingsMock).toHaveBeenCalledWith("postgres://user:pass@localhost:5432/app", {
      juno_login_password: null,
    });
    expect(JSON.stringify(clearResponse.body)).toContain("Not saved");
    expect(JSON.stringify(clearResponse.body)).not.toContain("db-juno-password");

    await expect(
      expectJson(
        patchSettings(jsonRequest({ juno: { juno_live_delay_min_ms: 200, juno_live_delay_max_ms: 100 } })),
      ),
    ).resolves.toMatchObject({
      status: 400,
      body: { error: "invalid_settings" },
    });

    await expect(expectJson(patchSettings(jsonRequest({ auth: { auth_base_url: "not-a-url" } })))).resolves.toMatchObject({
      status: 400,
      body: { error: "invalid_settings" },
    });

    await expect(expectJson(testGmailSettings(jsonRequest({ mode: "smoke" })))).resolves.toMatchObject({
      status: 200,
      body: { ok: false, status: "missing_mail_source" },
    });

    listActiveMailboxSourcesMock.mockResolvedValueOnce([
      {
        ...mailSource(),
        scopes: "https://www.googleapis.com/auth/gmail.modify",
      },
    ]);
    await expect(expectJson(testGmailSettings(jsonRequest({ mode: "smoke" })))).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        status: "read_only_smoke_passed",
        results: [
          expect.objectContaining({
            sourceId: "source-1",
            mailboxAddress: "operator@example.test",
            status: "read_only_smoke_passed",
          }),
        ],
      },
    });
    expect(parseServiceAccountKeyJsonMock).toHaveBeenCalledWith("secret");
    expect(getDelegatedAccessTokenMock).toHaveBeenCalledWith(expect.objectContaining({
      subject: "operator@example.test",
      scopes: [GOOGLE_GMAIL_READONLY_SCOPE],
    }));
    expect(gmailClientMock).toHaveBeenCalledWith("operator@example.test", "gmail-access-token");

    ensureServiceSettingsRowMock.mockResolvedValueOnce({
      ...emptySettingsRow(),
      juno_login_email: "buyer@example.test",
      juno_login_password: "db-juno-password",
      juno_live_delay_min_ms: 30000,
      juno_live_delay_max_ms: 180000,
    });
    await expect(expectJson(testJunoSessionSettings(jsonRequest({ mode: "smoke" })))).resolves.toMatchObject({
      status: 200,
      body: { ok: true, status: "read_only_preflight_passed", readOnly: true },
    });

  });

  it("guards mail source CRUD and never returns credential secrets", async () => {
    listMailboxSourcesMock.mockResolvedValue([mailSource()]);

    const getResponse = await expectJson(getMailSources(request()));
    expect(getResponse).toEqual({
      status: 200,
      body: {
        sources: [
          expect.not.objectContaining({
            credentialSecret: expect.anything(),
          }),
        ],
      },
    });
    expect(JSON.stringify(getResponse.body)).not.toContain("secret");
    expect(listMailboxSourcesMock).toHaveBeenCalledWith("postgres://user:pass@localhost:5432/app");

    const testResponse = await expectJson(postMailSourcesTest(jsonRequest({
      name: "Ops Gmail",
      provider: "gmail",
      authType: "google_workspace_delegation",
      credentialType: "google_service_account_json",
      credentialSecret: "{\"client_email\":\"ops@example.test\"}",
      mailboxAddress: "ops@example.test",
      query: "filename:xlsx",
      storageDir: ".data/mail",
      attachmentPattern: "xlsx",
      supplierCode: "juno",
    })));
    expect(testResponse).toEqual({
      status: 200,
      body: {
        test: {
          ok: true,
          status: "connection_ready",
          provider: "gmail",
          mailboxAddress: "ops@example.test",
          query: "filename:xlsx",
          messageCount: 1,
        },
      },
    });
    expect(testMailboxSourceConnectionMock).toHaveBeenCalledWith(expect.objectContaining({
      provider: "gmail",
      mailboxAddress: "ops@example.test",
      credentialSecret: "{\"client_email\":\"ops@example.test\"}",
    }));

    await expect(expectJson(postMailSourcesTest(jsonRequest({ id: "source-1", query: "from:vendor filename:xlsx" })))).resolves.toEqual({
      status: 200,
      body: {
        test: {
          ok: true,
          status: "connection_ready",
          provider: "gmail",
          mailboxAddress: "ops@example.test",
          query: "filename:xlsx",
          messageCount: 1,
        },
      },
    });
    expect(testMailboxSourceConnectionMock).toHaveBeenLastCalledWith(expect.objectContaining({
      credentialSecret: "secret",
      query: "from:vendor filename:xlsx",
    }));

    const input = {
      name: "Ops Gmail",
      provider: "gmail",
      authType: "google_workspace_delegation",
      credentialType: "google_service_account_json",
      credentialSecret: "{\"client_email\":\"ops@example.test\"}",
      mailboxAddress: "ops@example.test",
      query: "filename:xlsx",
      storageDir: ".data/mail",
      attachmentPattern: "xlsx",
      supplierCode: "juno",
    };
    await expect(expectJson(postMailSources(jsonRequest(input)))).resolves.toEqual({
      status: 400,
      body: { error: "mail_source_connection_test_required" },
    });
    expect(createMailboxSourceMock).not.toHaveBeenCalled();

    testMailboxSourceConnectionMock.mockResolvedValueOnce({
      ok: false,
      status: "provider_not_implemented",
      provider: "imap",
      mailboxAddress: "ops@example.test",
      query: "filename:xlsx",
      error: "IMAP connection testing is not implemented yet.",
    });
    await expect(expectJson(postMailSources(jsonRequest({
      ...input,
      provider: "imap",
      connectionTestPassed: true,
    })))).resolves.toEqual({
      status: 400,
      body: {
        error: "mail_source_connection_test_failed",
        test: {
          ok: false,
          status: "provider_not_implemented",
          provider: "imap",
          mailboxAddress: "ops@example.test",
          query: "filename:xlsx",
          error: "IMAP connection testing is not implemented yet.",
        },
      },
    });
    expect(createMailboxSourceMock).not.toHaveBeenCalled();

    const postResponse = await expectJson(postMailSources(jsonRequest({ ...input, connectionTestPassed: true })));
    expect(postResponse).toEqual({
      status: 201,
      body: { source: expect.not.objectContaining({ credentialSecret: expect.anything() }) },
    });
    expect(createMailboxSourceMock).toHaveBeenCalledWith("postgres://user:pass@localhost:5432/app", input);

    updateMailboxSourceMock.mockResolvedValueOnce(mailSource()).mockResolvedValueOnce(mailSource()).mockResolvedValueOnce(null);
    await expect(expectJson(patchMailSources(jsonRequest({ id: "source-1", isActive: false })))).resolves.toEqual({
      status: 200,
      body: { source: expect.not.objectContaining({ credentialSecret: expect.anything() }) },
    });
    expect(updateMailboxSourceMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", {
      id: "source-1",
      isActive: false,
    });

    await expect(expectJson(patchMailSources(jsonRequest({ id: "source-1", isActive: true })))).resolves.toEqual({
      status: 200,
      body: { source: expect.not.objectContaining({ credentialSecret: expect.anything() }) },
    });
    expect(testMailboxSourceConnectionMock).toHaveBeenLastCalledWith(expect.objectContaining({
      mailboxAddress: "operator@example.test",
      credentialSecret: "secret",
    }));

    await expect(expectJson(patchMailSources(jsonRequest({ id: "missing", isActive: false })))).resolves.toEqual({
      status: 404,
      body: { error: "mail_source_not_found" },
    });
    await expect(expectJson(patchMailSources(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });
    updateMailboxSourceMock.mockRejectedValueOnce("bad source");
    await expect(expectJson(patchMailSources(jsonRequest({ id: "source-1", provider: "gmail" })))).resolves.toEqual({
      status: 400,
      body: { error: "mail_source_connection_test_required" },
    });
    await expect(expectJson(patchMailSources(jsonRequest({ id: "source-1", provider: "gmail", connectionTestPassed: true })))).resolves.toEqual({
      status: 400,
      body: { error: "Invalid mail source request" },
    });

    deleteMailboxSourceMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(expectJson(deleteMailSources(jsonRequest({ id: "source-1" })))).resolves.toEqual({
      status: 200,
      body: { deleted: true },
    });
    expect(deleteMailboxSourceMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", "source-1");
    await expect(expectJson(deleteMailSources(jsonRequest({ id: "missing" })))).resolves.toEqual({
      status: 404,
      body: { error: "mail_source_not_found" },
    });
    await expect(expectJson(deleteMailSources(jsonRequest({ id: "" })))).resolves.toEqual({
      status: 400,
      body: { error: "Mail source id is required" },
    });
    await expect(expectJson(deleteMailSources(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });

    createMailboxSourceMock.mockRejectedValueOnce("bad source");
    await expect(expectJson(postMailSources(jsonRequest({ ...input, connectionTestPassed: true })))).resolves.toEqual({
      status: 400,
      body: { error: "Invalid mail source request" },
    });
    await expect(expectJson(postMailSources(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });
  });

  it("returns today signals through the admin route with conservative limit parsing", async () => {
    getTodaySignalsMock.mockResolvedValue([{ signalId: "signal-1" }] as never);

    await expect(expectJson(getTodayInsights(new Request("http://app.test/api/insights/today?limit=25")))).resolves.toEqual({
      status: 200,
      body: { signals: [{ signalId: "signal-1" }] },
    });
    expect(getTodaySignalsMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", 25);

    await expect(expectJson(getTodayInsights(new Request("http://app.test/api/insights/today?limit=-1")))).resolves.toEqual({
      status: 200,
      body: { signals: [{ signalId: "signal-1" }] },
    });
    expect(getTodaySignalsMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", 100);

    await expect(expectJson(getTodayInsights(new Request("http://app.test/api/insights/today")))).resolves.toEqual({
      status: 200,
      body: { signals: [{ signalId: "signal-1" }] },
    });
    expect(getTodaySignalsMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", 100);
  });

  it("returns movement, trend, and digest insights through admin routes", async () => {
    getMovementSignalsMock.mockResolvedValue([{ signalId: "movement-1" }] as never);
    getCatalogTrendsMock.mockResolvedValue({ genres: [], labels: [], watchOverlap: [] } as never);
    getInsightDigestMock.mockResolvedValue({ generatedAt: "2026-06-17T00:00:00.000Z" } as never);

    await expect(expectJson(getMovementInsights(new Request("http://app.test/api/insights/movement?limit=25")))).resolves.toEqual({
      status: 200,
      body: { signals: [{ signalId: "movement-1" }] },
    });
    expect(getMovementSignalsMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", 25);

    await expect(expectJson(getMovementInsights(new Request("http://app.test/api/insights/movement?limit=-1")))).resolves.toEqual({
      status: 200,
      body: { signals: [{ signalId: "movement-1" }] },
    });
    expect(getMovementSignalsMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", 100);
    await expect(expectJson(getMovementInsights(new Request("http://app.test/api/insights/movement")))).resolves.toEqual({
      status: 200,
      body: { signals: [{ signalId: "movement-1" }] },
    });
    expect(getMovementSignalsMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", 100);

    await expect(
      expectJson(
        getTrendInsights(
          new Request("http://app.test/api/insights/trends?windowDays=14&previousWindowDays=21&limit=10"),
        ),
      ),
    ).resolves.toEqual({
      status: 200,
      body: { trends: { genres: [], labels: [], watchOverlap: [] } },
    });
    expect(getCatalogTrendsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      windowDays: 14,
      previousWindowDays: 21,
      limit: 10,
    });

    await expect(
      expectJson(getTrendInsights(new Request("http://app.test/api/insights/trends?windowDays=0&previousWindowDays=91&limit=0"))),
    ).resolves.toEqual({
      status: 200,
      body: { trends: { genres: [], labels: [], watchOverlap: [] } },
    });
    expect(getCatalogTrendsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      windowDays: 7,
      previousWindowDays: 7,
      limit: 20,
    });
    await expect(expectJson(getTrendInsights(new Request("http://app.test/api/insights/trends")))).resolves.toEqual({
      status: 200,
      body: { trends: { genres: [], labels: [], watchOverlap: [] } },
    });
    expect(getCatalogTrendsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      windowDays: 7,
      previousWindowDays: 7,
      limit: 20,
    });

    await expect(expectJson(getDigestInsights(request()))).resolves.toEqual({
      status: 200,
      body: { digest: { generatedAt: "2026-06-17T00:00:00.000Z" } },
    });
    expect(getInsightDigestMock).toHaveBeenCalledWith("postgres://user:pass@localhost:5432/app");
  });

  it("guards dashboard saved view CRUD and translates validation outcomes", async () => {
    listDashboardSavedViewsMock.mockResolvedValue([{ id: "view-1", name: "Watch hits" }] as never);
    createDashboardSavedViewMock.mockResolvedValue({ id: "view-2", name: "Warnings" } as never);
    updateDashboardSavedViewMock.mockResolvedValueOnce({ id: "view-2", name: "Low stock" } as never).mockResolvedValueOnce(null);
    deleteDashboardSavedViewMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(expectJson(getDashboardSavedViews(request()))).resolves.toEqual({
      status: 200,
      body: { views: [{ id: "view-1", name: "Watch hits" }] },
    });
    expect(listDashboardSavedViewsMock).toHaveBeenCalledWith("postgres://user:pass@localhost:5432/app");

    await expect(expectJson(postDashboardSavedViews(jsonRequest({
      name: "Warnings",
      filters: { severities: ["warning"], rawCatalogRow: { ignored: true } },
    })))).resolves.toEqual({
      status: 201,
      body: { view: { id: "view-2", name: "Warnings" } },
    });
    expect(createDashboardSavedViewMock).toHaveBeenCalledWith("postgres://user:pass@localhost:5432/app", {
      name: "Warnings",
      filters: { severities: ["warning"], rawCatalogRow: { ignored: true } },
    });

    await expect(expectJson(patchDashboardSavedViews(jsonRequest({ id: "view-2", name: "Low stock" })))).resolves.toEqual({
      status: 200,
      body: { view: { id: "view-2", name: "Low stock" } },
    });
    await expect(expectJson(patchDashboardSavedViews(jsonRequest({ id: "missing", name: "Missing" })))).resolves.toEqual({
      status: 404,
      body: { error: "dashboard_saved_view_not_found" },
    });
    await expect(expectJson(patchDashboardSavedViews(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });

    await expect(expectJson(deleteDashboardSavedViews(jsonRequest({ id: "view-2" })))).resolves.toEqual({
      status: 200,
      body: { deleted: true },
    });
    await expect(expectJson(deleteDashboardSavedViews(jsonRequest({ id: "missing" })))).resolves.toEqual({
      status: 404,
      body: { error: "dashboard_saved_view_not_found" },
    });
    await expect(expectJson(deleteDashboardSavedViews(jsonRequest({ id: "" })))).resolves.toEqual({
      status: 400,
      body: { error: "Dashboard saved view id is required" },
    });
    await expect(expectJson(postDashboardSavedViews(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });

    createDashboardSavedViewMock.mockRejectedValueOnce("bad view");
    await expect(expectJson(postDashboardSavedViews(jsonRequest({ name: "Bad" })))).resolves.toEqual({
      status: 400,
      body: { error: "Invalid dashboard saved view request" },
    });
  });

  it("guards watch rule CRUD and translates validation outcomes", async () => {
    listWatchRulesMock.mockResolvedValue([{ id: "rule-1", pattern: "Lara Voss" }] as never);
    createWatchRuleMock.mockResolvedValue({ id: "rule-2", pattern: "Blue Note" } as never);
    updateWatchRuleMock.mockResolvedValueOnce({ id: "rule-2", enabled: false } as never).mockResolvedValueOnce(null);
    deleteWatchRuleMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(expectJson(getWatchRules(request()))).resolves.toEqual({
      status: 200,
      body: { rules: [{ id: "rule-1", pattern: "Lara Voss" }] },
    });
    await expect(expectJson(postWatchRules(jsonRequest({ type: "label", pattern: "Blue Note" })))).resolves.toEqual({
      status: 201,
      body: { rule: { id: "rule-2", pattern: "Blue Note" } },
    });
    await expect(expectJson(patchWatchRules(jsonRequest({ id: "rule-2", enabled: false })))).resolves.toEqual({
      status: 200,
      body: { rule: { id: "rule-2", enabled: false } },
    });
    await expect(expectJson(patchWatchRules(jsonRequest({ id: "missing", enabled: true })))).resolves.toEqual({
      status: 404,
      body: { error: "watch_rule_not_found" },
    });
    await expect(expectJson(patchWatchRules(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });
    await expect(expectJson(deleteWatchRules(jsonRequest({ id: "rule-2" })))).resolves.toEqual({
      status: 200,
      body: { deleted: true },
    });
    await expect(expectJson(deleteWatchRules(jsonRequest({ id: "missing" })))).resolves.toEqual({
      status: 404,
      body: { error: "watch_rule_not_found" },
    });

    await expect(expectJson(postWatchRules(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });
    createWatchRuleMock.mockRejectedValueOnce("bad rule");
    await expect(expectJson(postWatchRules(jsonRequest({ type: "artist", pattern: "Artist" })))).resolves.toEqual({
      status: 400,
      body: { error: "Invalid watch rule request" },
    });
    await expect(expectJson(deleteWatchRules(jsonRequest({ id: "" })))).resolves.toEqual({
      status: 400,
      body: { error: "Watch rule id is required" },
    });
  });

  it("guards notification APIs and keeps action modes explicit", async () => {
    listNotificationDeliveriesMock.mockResolvedValue([{ id: "delivery-1" }] as never);
    listNotificationChannelsMock.mockResolvedValue([{ id: "channel-1" }] as never);
    createNotificationChannelMock.mockResolvedValue({ id: "channel-2" } as never);
    updateNotificationChannelMock.mockResolvedValueOnce({ id: "channel-2", enabled: false } as never).mockResolvedValueOnce(null);
    deleteNotificationChannelMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    listNotificationRulesMock.mockResolvedValue([{ id: "notification-rule-1" }] as never);
    createNotificationRuleMock.mockResolvedValue({ id: "notification-rule-2" } as never);
    updateNotificationRuleMock.mockResolvedValueOnce({ id: "notification-rule-2", enabled: false } as never).mockResolvedValueOnce(null);
    deleteNotificationRuleMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    matchNotificationRulesForSignalsMock
      .mockResolvedValueOnce({ queued: 2, skipped: 1 })
      .mockResolvedValueOnce({ queued: 0, skipped: 0 })
      .mockResolvedValueOnce({ queued: 1, skipped: 0 })
      .mockResolvedValueOnce({ queued: 1, skipped: 0 })
      .mockResolvedValueOnce({ queued: 0, skipped: 0 });
    dispatchQueuedNotificationsMock
      .mockResolvedValueOnce({ sent: 0, failed: 0, skipped: 2, dryRun: true })
      .mockResolvedValueOnce({ sent: 2, failed: 0, skipped: 0, dryRun: false })
      .mockResolvedValueOnce({ sent: 0, failed: 0, skipped: 1, dryRun: true })
      .mockResolvedValueOnce({ sent: 0, failed: 0, skipped: 1, dryRun: true })
      .mockResolvedValueOnce({ sent: 1, failed: 0, skipped: 0, dryRun: false });

    await expect(expectJson(getNotificationDeliveries(new Request("http://app.test/api/notifications/deliveries?limit=25")))).resolves.toEqual({
      status: 200,
      body: { deliveries: [{ id: "delivery-1" }] },
    });
    expect(listNotificationDeliveriesMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", 25);
    await expect(expectJson(getNotificationDeliveries(new Request("http://app.test/api/notifications/deliveries?limit=-1")))).resolves.toEqual({
      status: 200,
      body: { deliveries: [{ id: "delivery-1" }] },
    });
    expect(listNotificationDeliveriesMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", 100);

    await expect(expectJson(getNotificationChannels(request()))).resolves.toEqual({
      status: 200,
      body: { channels: [{ id: "channel-1" }] },
    });
    await expect(expectJson(postNotificationChannels(jsonRequest({ name: "Ops", type: "logging" })))).resolves.toEqual({
      status: 201,
      body: { channel: { id: "channel-2" } },
    });
    await expect(expectJson(patchNotificationChannels(jsonRequest({ id: "channel-2", enabled: false })))).resolves.toEqual({
      status: 200,
      body: { channel: { id: "channel-2", enabled: false } },
    });
    await expect(expectJson(patchNotificationChannels(jsonRequest({ id: "missing", enabled: true })))).resolves.toEqual({
      status: 404,
      body: { error: "notification_channel_not_found" },
    });
    await expect(expectJson(patchNotificationChannels(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });
    await expect(expectJson(deleteNotificationChannels(jsonRequest({ id: "channel-2" })))).resolves.toEqual({
      status: 200,
      body: { deleted: true },
    });
    await expect(expectJson(deleteNotificationChannels(jsonRequest({ id: "missing" })))).resolves.toEqual({
      status: 404,
      body: { error: "notification_channel_not_found" },
    });
    await expect(expectJson(deleteNotificationChannels(jsonRequest({ id: "" })))).resolves.toEqual({
      status: 400,
      body: { error: "Notification channel id is required" },
    });
    await expect(expectJson(postNotificationChannels(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });
    createNotificationChannelMock.mockRejectedValueOnce("bad channel");
    await expect(expectJson(postNotificationChannels(jsonRequest({ name: "Ops", type: "logging" })))).resolves.toEqual({
      status: 400,
      body: { error: "Invalid notification channel request" },
    });

    await expect(expectJson(getNotificationRules(request()))).resolves.toEqual({
      status: 200,
      body: { rules: [{ id: "notification-rule-1" }] },
    });
    await expect(expectJson(postNotificationRules(jsonRequest({ name: "Rule", channelId: "channel-1" })))).resolves.toEqual({
      status: 201,
      body: { rule: { id: "notification-rule-2" } },
    });
    await expect(expectJson(patchNotificationRules(jsonRequest({ id: "notification-rule-2", enabled: false })))).resolves.toEqual({
      status: 200,
      body: { rule: { id: "notification-rule-2", enabled: false } },
    });
    await expect(expectJson(patchNotificationRules(jsonRequest({ id: "missing", enabled: true })))).resolves.toEqual({
      status: 404,
      body: { error: "notification_rule_not_found" },
    });
    await expect(expectJson(patchNotificationRules(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });
    await expect(expectJson(deleteNotificationRules(jsonRequest({ id: "notification-rule-2" })))).resolves.toEqual({
      status: 200,
      body: { deleted: true },
    });
    await expect(expectJson(deleteNotificationRules(jsonRequest({ id: "missing" })))).resolves.toEqual({
      status: 404,
      body: { error: "notification_rule_not_found" },
    });
    await expect(expectJson(deleteNotificationRules(jsonRequest({ id: "" })))).resolves.toEqual({
      status: 400,
      body: { error: "Notification rule id is required" },
    });
    await expect(expectJson(postNotificationRules(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });
    createNotificationRuleMock.mockRejectedValueOnce("bad rule");
    await expect(expectJson(postNotificationRules(jsonRequest({ name: "Rule", channelId: "channel-1" })))).resolves.toEqual({
      status: 400,
      body: { error: "Invalid notification rule request" },
    });

    await expect(expectJson(queueNotifications(jsonRequest({ since: "2026-06-18T00:00:00.000Z", digestDate: "2026-06-18", limit: 25 })))).resolves.toEqual({
      status: 200,
      body: { queued: 2, skipped: 1 },
    });
    expect(matchNotificationRulesForSignalsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      since: "2026-06-18T00:00:00.000Z",
      digestDate: "2026-06-18",
      limit: 25,
    });
    await expect(expectJson(queueNotifications(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });
    await expect(expectJson(queueNotifications(jsonRequest({})))).resolves.toEqual({
      status: 200,
      body: { queued: 0, skipped: 0 },
    });
    expect(matchNotificationRulesForSignalsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      since: undefined,
      digestDate: undefined,
      limit: 100,
    });
    await expect(expectJson(queueNotifications(jsonRequest({ limit: "25" })))).resolves.toEqual({
      status: 200,
      body: { queued: 1, skipped: 0 },
    });
    expect(matchNotificationRulesForSignalsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      since: undefined,
      digestDate: undefined,
      limit: 25,
    });
    await expect(expectJson(dispatchNotifications(jsonRequest({ limit: "bad" })))).resolves.toEqual({
      status: 200,
      body: { sent: 0, failed: 0, skipped: 2, dryRun: true },
    });
    expect(dispatchQueuedNotificationsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      mode: "dry-run",
      limit: 100,
    });
    await expect(expectJson(dispatchNotifications(jsonRequest({ mode: "send", limit: 5 })))).resolves.toEqual({
      status: 200,
      body: { sent: 2, failed: 0, skipped: 0, dryRun: false },
    });
    expect(dispatchQueuedNotificationsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      mode: "send",
      limit: 5,
    });
    await expect(expectJson(dispatchNotifications(jsonRequest(null)))).resolves.toEqual({
      status: 200,
      body: { sent: 0, failed: 0, skipped: 1, dryRun: true },
    });
    expect(dispatchQueuedNotificationsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      mode: "dry-run",
      limit: 100,
    });
    await expect(expectJson(dispatchNotifications(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });
    await expect(expectJson(refreshNotifications(jsonRequest({
      since: "2026-06-18T00:00:00.000Z",
      digestDate: "2026-06-18",
      limit: "bad",
    })))).resolves.toEqual({
      status: 200,
      body: {
        queued: { queued: 1, skipped: 0 },
        dispatched: { sent: 0, failed: 0, skipped: 1, dryRun: true },
      },
    });
    expect(dispatchQueuedNotificationsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      mode: "dry-run",
      limit: 100,
    });
    await expect(expectJson(refreshNotifications(jsonRequest({ mode: "send", limit: 10 })))).resolves.toEqual({
      status: 200,
      body: {
        queued: { queued: 0, skipped: 0 },
        dispatched: { sent: 1, failed: 0, skipped: 0, dryRun: false },
      },
    });
    expect(dispatchQueuedNotificationsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      mode: "send",
      limit: 10,
    });
    await expect(expectJson(refreshNotifications(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });
  });

  it("parses notification action edge bodies conservatively", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/app");
    matchNotificationRulesForSignalsMock
      .mockResolvedValueOnce({ queued: 0, skipped: 0 })
      .mockResolvedValueOnce({ queued: 0, skipped: 0 })
      .mockResolvedValueOnce({ queued: 1, skipped: 0 })
      .mockResolvedValueOnce({ queued: 0, skipped: 0 })
      .mockResolvedValueOnce({ queued: 0, skipped: 0 });
    dispatchQueuedNotificationsMock
      .mockResolvedValueOnce({ sent: 0, failed: 0, skipped: 0, dryRun: true })
      .mockResolvedValueOnce({ sent: 0, failed: 0, skipped: 0, dryRun: true })
      .mockResolvedValueOnce({ sent: 0, failed: 0, skipped: 0, dryRun: true })
      .mockResolvedValueOnce({ sent: 0, failed: 0, skipped: 0, dryRun: false });

    await expect(expectJson(queueNotifications(jsonRequest({ limit: false })))).resolves.toEqual({
      status: 200,
      body: { queued: 0, skipped: 0 },
    });
    expect(matchNotificationRulesForSignalsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      since: undefined,
      digestDate: undefined,
      limit: 100,
    });
    await expect(expectJson(queueNotifications(jsonRequest({ since: "", digestDate: "", limit: "25" })))).resolves.toEqual({
      status: 200,
      body: { queued: 0, skipped: 0 },
    });
    expect(matchNotificationRulesForSignalsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      since: undefined,
      digestDate: undefined,
      limit: 25,
    });

    await expect(expectJson(dispatchNotifications(jsonRequest({ mode: "dry-run", limit: false })))).resolves.toEqual({
      status: 200,
      body: { sent: 0, failed: 0, skipped: 0, dryRun: true },
    });
    expect(dispatchQueuedNotificationsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      mode: "dry-run",
      limit: 100,
    });

    await expect(expectJson(refreshNotifications(jsonRequest({ mode: "dry-run", since: "", digestDate: "", limit: "25" })))).resolves.toEqual({
      status: 200,
      body: {
        queued: { queued: 1, skipped: 0 },
        dispatched: { sent: 0, failed: 0, skipped: 0, dryRun: true },
      },
    });
    expect(dispatchQueuedNotificationsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      mode: "dry-run",
      limit: 25,
    });

    await expect(expectJson(refreshNotifications(jsonRequest({ limit: false })))).resolves.toEqual({
      status: 200,
      body: {
        queued: { queued: 0, skipped: 0 },
        dispatched: { sent: 0, failed: 0, skipped: 0, dryRun: true },
      },
    });
    expect(dispatchQueuedNotificationsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      mode: "dry-run",
      limit: 100,
    });

    await expect(expectJson(refreshNotifications(jsonRequest({ mode: "send" })))).resolves.toEqual({
      status: 200,
      body: {
        queued: { queued: 0, skipped: 0 },
        dispatched: { sent: 0, failed: 0, skipped: 0, dryRun: false },
      },
    });
    expect(dispatchQueuedNotificationsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      mode: "send",
      limit: 100,
    });
  });

  it("builds settings status with database-backed overrides", async () => {
    await expect(expectJson(getSettingsStatus(request()))).resolves.toMatchObject({
      status: 200,
      body: {
        setup: {
          ready: false,
        },
      },
    });
    expect(repository.getServiceSettingsRow).toHaveBeenCalled();
  });

  it("returns live lookup summary from database state", async () => {
    await expect(expectJson(getLiveLookupStatus(request()))).resolves.toEqual({
      status: 200,
      body: { summary: { queued: 2 } },
    });
    expect(repository.getSummary).toHaveBeenCalled();
  });

  it("guards and dispatches live worker control actions", async () => {
    await expect(expectJson(getLiveLookupWorker(request()))).resolves.toEqual({
      status: 200,
      body: { worker: { state: "stopped" } },
    });
    await expect(expectJson(postLiveLookupWorker(jsonRequest({ action: "start" })))).resolves.toEqual({
      status: 200,
      body: { worker: { state: "running" } },
    });
    await expect(expectJson(postLiveLookupWorker(jsonRequest({ action: "stop" })))).resolves.toEqual({
      status: 200,
      body: { worker: { state: "stopped" } },
    });
    await expect(expectJson(postLiveLookupWorker(jsonRequest({ action: "restart" })))).resolves.toEqual({
      status: 200,
      body: { worker: { state: "running", restarts: 1 } },
    });
    await expect(expectJson(postLiveLookupWorker(jsonRequest({ action: "pause" })))).resolves.toEqual({
      status: 400,
      body: { error: "action must be start, stop, or restart" },
    });
    await expect(
      expectJson(
        postLiveLookupWorker(
          new Request("http://app.test/api/live-lookups/worker", {
            method: "POST",
            body: "{",
          }),
        ),
      ),
    ).resolves.toEqual({
      status: 400,
      body: { error: "action must be start, stop, or restart" },
    });

    expect(manager.start).toHaveBeenCalledTimes(1);
    expect(manager.stopAndWait).toHaveBeenCalledTimes(1);
    expect(manager.restart).toHaveBeenCalledTimes(1);
  });

  it("enqueues live lookup jobs with conservative parsing fallbacks", async () => {
    enqueueLiveLookupJobsMock.mockResolvedValue({ enqueued: 3, skipped: 1 } as never);

    await expect(expectJson(
      enqueueLiveLookups(jsonRequest({ snapshotId: "snapshot-1", limit: "15" })),
    )).resolves.toEqual({
      status: 200,
      body: { enqueued: 3, skipped: 1 },
    });
    expect(enqueueLiveLookupJobsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      snapshotId: "snapshot-1",
      limit: 15,
      maxAttempts: 2,
    });

    await expect(
      expectJson(enqueueLiveLookups(jsonRequest({ snapshotId: 123, limit: "not-a-number" }))),
    ).resolves.toEqual({
      status: 200,
      body: { enqueued: 3, skipped: 1 },
    });
    expect(enqueueLiveLookupJobsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      snapshotId: null,
      limit: 1000,
      maxAttempts: 2,
    });

    await expect(expectJson(enqueueLiveLookups(jsonRequest({ limit: "-1" })))).resolves.toEqual({
      status: 200,
      body: { enqueued: 3, skipped: 1 },
    });
    expect(enqueueLiveLookupJobsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 1000 }),
    );
  });

  it("falls back to default enqueue options when the request body is not JSON", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/app");
    enqueueLiveLookupJobsMock.mockResolvedValue({ enqueued: 0, skipped: 0 } as never);

    await expect(
      expectJson(
        enqueueLiveLookups(
          new Request("http://app.test/api/live-lookups/enqueue", {
            method: "POST",
            body: "{",
          }),
        ),
      ),
    ).resolves.toEqual({
      status: 200,
      body: { enqueued: 0, skipped: 0 },
    });
    expect(enqueueLiveLookupJobsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshotId: null,
        limit: 1000,
      }),
    );
  });
});

function request(): Request {
  return new Request("http://app.test/api/protected");
}

function jsonRequest(body: unknown): Request {
  return new Request("http://app.test/api/protected", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function invalidJsonRequest(): Request {
  return new Request("http://app.test/api/protected", {
    method: "POST",
    body: "{",
  });
}

async function expectStatus(responsePromise: Promise<Response>, status: number): Promise<void> {
  await expect(responsePromise.then((response) => response.status)).resolves.toBe(status);
}

async function expectJson(responsePromise: Promise<Response>): Promise<{ status: number; body: unknown }> {
  const response = await responsePromise;
  return {
    status: response.status,
    body: await response.json(),
  };
}

function emptySettingsRow(): ServiceSettingsRow {
  return {
    juno_live_enqueue_on_ingest: null,
    juno_login_email: null,
    juno_login_password: null,
    juno_browser_profile_dir: null,
    juno_browser_headless: null,
    juno_live_concurrency: null,
    juno_live_delay_min_ms: null,
    juno_live_delay_max_ms: null,
    juno_live_nav_timeout_ms: null,
    juno_live_max_attempts: null,
    juno_live_poll_interval_ms: null,
    juno_live_auto_enqueue_on_interval: null,
    juno_live_auto_enqueue_limit: null,
    auth_secret: null,
    auth_base_url: null,
    auth_trusted_origins: null,
    auth_email_password_login_enabled: true,
    auth_login_logo_url: null,
    updated_at: null,
  };
}

function mailSource() {
  return {
    id: "source-1",
    connectionId: "connection-1",
    name: "Mail source",
    provider: "gmail" as const,
    authType: "google_workspace_delegation" as const,
    credentialType: "google_service_account_json" as const,
    credentialSecret: "secret",
    credentialReference: null,
    credentialConfigured: true,
    scopes: "https://www.googleapis.com/auth/gmail.readonly",
    mailboxAddress: "operator@example.test",
    displayName: "Operator",
    query: "filename:xlsx",
    maxResults: 10,
    lookbackMs: 604800000,
    processedLabel: "Processed",
    storageBackend: "local_drive" as const,
    storageDir: ".data/test-mail",
    storageEndpoint: "",
    storageBucket: "",
    storagePrefix: "mail-attachments",
    storageRegion: "us-east-1",
    storageAccessKeyId: "",
    storageSecret: null,
    storageSecretConfigured: false,
    storageForcePathStyle: true,
    attachmentPattern: "xlsx",
    supplierCode: "juno",
    isActive: true,
  };
}

function dashboardSavedView() {
  return {
    id: "view-1",
    name: "Watch hits",
    filters: {
      signalTypes: ["watch_hit" as const],
      severities: [],
      watchHitsOnly: true,
      lowStockOnly: false,
      movementOnly: false,
      dateRange: "all" as const,
    },
    sortOrder: 0,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
  };
}
