import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeBase64Url,
  findXlsxAttachments,
  getAllHeaders,
  getHeader,
  GmailClient,
  type GmailMessage,
} from "./gmail";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("GmailClient", () => {
  it("lists messages and returns an empty array when Gmail omits messages", async () => {
    const fetchMock = mockFetch([
      { ok: true, json: { messages: [{ id: "m1", threadId: "t1" }] } },
      { ok: true, json: {} },
    ]);
    const client = new GmailClient("state303@dsub.io", "token");

    await expect(client.listMessages("filename:xlsx", 10)).resolves.toEqual([
      { id: "m1", threadId: "t1" },
    ]);
    await expect(client.listMessages("filename:xlsx", 10)).resolves.toEqual([]);

    const calls = fetchMock.mock.calls as unknown as Array<[URL, RequestInit | undefined]>;
    expect(calls[0][0].toString()).toContain("q=filename%3Axlsx");
    expect(calls[0][1]?.headers).toMatchObject({
      authorization: "Bearer token",
      "content-type": "application/json",
    });
  });

  it("gets messages, attachments, and applies labels", async () => {
    const encoded = Buffer.from("xlsx bytes").toString("base64url");
    const fetchMock = mockFetch([
      { ok: true, json: { id: "m1", payload: { headers: [] } } },
      { ok: true, json: { data: encoded } },
      { ok: true, json: {} },
    ]);
    const client = new GmailClient("state303@dsub.io", "token");

    await expect(client.getMessage("m1")).resolves.toMatchObject({ id: "m1" });
    await expect(client.getAttachment("m1", "a1")).resolves.toEqual(Buffer.from("xlsx bytes"));
    await expect(client.addLabel("m1", "Label_1")).resolves.toBeUndefined();

    const calls = fetchMock.mock.calls as unknown as Array<[URL, RequestInit | undefined]>;
    expect(calls[2][1]?.body).toBe(JSON.stringify({ addLabelIds: ["Label_1"] }));
  });

  it("reuses an existing label and creates a missing label", async () => {
    const fetchMock = mockFetch([
      { ok: true, json: { labels: [{ id: "Label_1", name: "Processed" }] } },
      { ok: true, json: { labels: [] } },
      { ok: true, json: { id: "Label_2" } },
    ]);
    const client = new GmailClient("state303@dsub.io", "token");

    await expect(client.getOrCreateLabel("Processed")).resolves.toBe("Label_1");
    await expect(client.getOrCreateLabel("Processed")).resolves.toBe("Label_2");

    const calls = fetchMock.mock.calls as unknown as Array<[URL, RequestInit | undefined]>;
    expect(calls[2][1]?.body).toBe(
      JSON.stringify({
        name: "Processed",
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      }),
    );
  });

  it("throws Gmail API errors even when the body is not JSON", async () => {
    mockFetch([
      {
        ok: false,
        status: 403,
        jsonError: new Error("not json"),
      },
    ]);
    const client = new GmailClient("state303@dsub.io", "token");

    await expect(client.listMessages("filename:xlsx", 10)).rejects.toThrow("Gmail API 403");
  });
});

describe("Gmail message helpers", () => {
  const message: GmailMessage = {
    id: "m1",
    payload: {
      headers: [
        { name: "Subject", value: "Daily Juno" },
        { name: "Delivered-To", value: "state303@dsub.io" },
        { name: "delivered-to", value: "inventory@dsub.io" },
      ],
      parts: [
        {
          filename: "ignored.txt",
          mimeType: "text/plain",
          body: { size: 10 },
        },
        {
          filename: "mime-missing.xlsx",
          body: { attachmentId: "a0", size: 5 },
        },
        {
          filename: " Juno Wholesale New Preorders.xlsx ",
          mimeType: "application/octet-stream",
          body: { attachmentId: "a1", size: 20 },
        },
        {
          filename: "stock-report",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          body: { data: Buffer.from("inline").toString("base64url") },
        },
        {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          body: { attachmentId: "no-file", size: 1 },
        },
      ],
    },
  };

  it("reads headers case-insensitively", () => {
    expect(getHeader(message, "subject")).toBe("Daily Juno");
    expect(getHeader({ id: "empty" }, "subject")).toBeUndefined();
    expect(getAllHeaders(message, "DELIVERED-TO")).toEqual([
      "state303@dsub.io",
      "inventory@dsub.io",
    ]);
    expect(getAllHeaders({ id: "empty" }, "DELIVERED-TO")).toEqual([]);
  });

  it("finds nested XLSX attachments and decodes base64url", () => {
    expect(findXlsxAttachments({ id: "empty" })).toEqual([]);
    expect(findXlsxAttachments(message)).toEqual([
      {
        filename: "mime-missing.xlsx",
        mimeType: "",
        attachmentId: "a0",
        size: 5,
        inlineData: undefined,
      },
      {
        filename: "Juno Wholesale New Preorders.xlsx",
        mimeType: "application/octet-stream",
        attachmentId: "a1",
        size: 20,
        inlineData: undefined,
      },
      {
        filename: "stock-report",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        attachmentId: undefined,
        size: 0,
        inlineData: Buffer.from("inline").toString("base64url"),
      },
    ]);
    expect(decodeBase64Url(Buffer.from("hello").toString("base64url")).toString()).toBe("hello");
  });
});

function mockFetch(
  responses: Array<{
    ok: boolean;
    status?: number;
    json?: unknown;
    jsonError?: Error;
  }>,
) {
  const fetchMock = vi.fn(async () => {
    const response = responses.shift();
    if (!response) {
      throw new Error("Unexpected fetch");
    }
    return {
      ok: response.ok,
      status: response.status ?? 200,
      json: async () => {
        if (response.jsonError) {
          throw response.jsonError;
        }
        return response.json;
      },
    } as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
