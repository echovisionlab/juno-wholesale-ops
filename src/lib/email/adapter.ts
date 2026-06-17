export type EmailAdapterType = "logging" | "smtp";

export type SmtpEmailAdapterConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName?: string;
};

export type EmailAdapterConfig =
  | { type: "logging"; config: Record<string, never> }
  | { type: "smtp"; config: SmtpEmailAdapterConfig };

export type EmailAdapterRecord = {
  id: string;
  name: string;
  type: EmailAdapterType;
  isActive: boolean;
  priority: number;
  config: unknown;
};

export type PublicEmailAdapterRecord = Omit<EmailAdapterRecord, "config"> & {
  config:
    | Record<string, never>
    | (Omit<SmtpEmailAdapterConfig, "password"> & { passwordConfigured: boolean });
};

export function normalizeSmtpEmailAdapterConfig(
  config: Partial<SmtpEmailAdapterConfig>,
): SmtpEmailAdapterConfig {
  return {
    host: config.host?.trim() ?? "",
    port: normalizePort(config.port),
    secure: Boolean(config.secure),
    user: config.user?.trim() ?? "",
    password: config.password?.trim() ?? "",
    fromEmail: config.fromEmail?.trim() ?? "",
    fromName: normalizeOptionalString(config.fromName),
  };
}

export function redactEmailAdapter(adapter: EmailAdapterRecord): PublicEmailAdapterRecord {
  if (adapter.type !== "smtp") {
    return { ...adapter, config: {} };
  }

  const config = normalizeSmtpEmailAdapterConfig(adapter.config as Partial<SmtpEmailAdapterConfig>);
  const { password, ...publicConfig } = config;

  return {
    ...adapter,
    config: {
      ...publicConfig,
      passwordConfigured: password.length > 0,
    },
  };
}

export function assertRunnableEmailAdapter(adapter: EmailAdapterConfig): void {
  if (adapter.type === "logging") {
    return;
  }

  const missing = [
    required("host", adapter.config.host),
    adapter.config.port > 0 ? null : "port",
    required("user", adapter.config.user),
    required("password", adapter.config.password),
    required("fromEmail", adapter.config.fromEmail),
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    throw new Error(`Email adapter settings are incomplete: ${missing.join(", ")}`);
  }
}

function normalizePort(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function required(name: string, value: string): string | null {
  return value.trim() ? null : name;
}
