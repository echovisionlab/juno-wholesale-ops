export type GmailHeader = {
  name: string;
  value: string;
};

export type GmailMessagePart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: {
    attachmentId?: string;
    size?: number;
    data?: string;
  };
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
};

export type GmailAttachmentRef = {
  filename: string;
  mimeType: string;
  attachmentId?: string;
  size: number;
  inlineData?: string;
};

export class GmailClient {
  constructor(
    private readonly userEmail: string,
    private readonly accessToken: string,
  ) {}

  async listMessages(query: string, maxResults: number): Promise<Array<{ id: string; threadId?: string }>> {
    const url = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(this.userEmail)}/messages`,
    );
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", String(maxResults));

    const body = await this.request<{
      messages?: Array<{ id: string; threadId?: string }>;
    }>(url);

    return body.messages ?? [];
  }

  async getMessage(messageId: string): Promise<GmailMessage> {
    const url = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
        this.userEmail,
      )}/messages/${encodeURIComponent(messageId)}`,
    );
    url.searchParams.set("format", "full");
    return this.request<GmailMessage>(url);
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    const url = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
        this.userEmail,
      )}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
    const body = await this.request<{ data: string }>(url);
    return decodeBase64Url(body.data);
  }

  async addLabel(messageId: string, labelId: string): Promise<void> {
    const url = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
        this.userEmail,
      )}/messages/${encodeURIComponent(messageId)}/modify`,
    );
    await this.request(url, {
      method: "POST",
      body: JSON.stringify({ addLabelIds: [labelId] }),
    });
  }

  async getOrCreateLabel(name: string): Promise<string> {
    const listUrl = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(this.userEmail)}/labels`,
    );
    const labels = await this.request<{ labels?: Array<{ id: string; name: string }> }>(listUrl);
    const existing = labels.labels?.find((label) => label.name === name);
    if (existing) {
      return existing.id;
    }

    const createUrl = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(this.userEmail)}/labels`,
    );
    const created = await this.request<{ id: string }>(createUrl, {
      method: "POST",
      body: JSON.stringify({
        name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      }),
    });
    return created.id;
  }

  private async request<T>(url: URL, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });

    const body = (await response.json().catch(() => ({}))) as T & {
      error?: { message?: string; status?: string };
    };

    if (!response.ok) {
      throw new Error(
        `Gmail API ${response.status}: ${body.error?.status ?? ""} ${
          body.error?.message ?? ""
        }`.trim(),
      );
    }

    return body;
  }
}

export function getHeader(message: GmailMessage, name: string): string | undefined {
  const target = name.toLowerCase();
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === target)?.value;
}

export function getAllHeaders(message: GmailMessage, name: string): string[] {
  const target = name.toLowerCase();
  return (
    message.payload?.headers
      ?.filter((header) => header.name.toLowerCase() === target)
      .map((header) => header.value) ?? []
  );
}

export function findXlsxAttachments(message: GmailMessage): GmailAttachmentRef[] {
  const attachments: GmailAttachmentRef[] = [];
  visitPart(message.payload, (part) => {
    const filename = part.filename?.trim();
    if (!filename) {
      return;
    }

    const mimeType = part.mimeType ?? "";
    const lowerFilename = filename.toLowerCase();
    const isXlsx =
      lowerFilename.endsWith(".xlsx") ||
      mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    if (!isXlsx) {
      return;
    }

    attachments.push({
      filename,
      mimeType,
      attachmentId: part.body?.attachmentId,
      size: part.body?.size ?? 0,
      inlineData: part.body?.data,
    });
  });
  return attachments;
}

export function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

function visitPart(part: GmailMessagePart | undefined, visitor: (part: GmailMessagePart) => void): void {
  if (!part) {
    return;
  }

  visitor(part);
  for (const child of part.parts ?? []) {
    visitPart(child, visitor);
  }
}
