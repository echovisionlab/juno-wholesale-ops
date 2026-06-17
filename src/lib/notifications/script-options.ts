import type { NotificationDispatchMode } from "./types";

export type NotificationScriptOptions = {
  mode: NotificationDispatchMode;
  limit?: number;
};

export function parseNotificationScriptOptions(argv: string[]): NotificationScriptOptions {
  return {
    mode: argv.includes("--send") ? "send" : "dry-run",
    limit: numberArg(argv, "--limit"),
  };
}

function numberArg(argv: string[], name: string): number | undefined {
  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = argv[index + 1];
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
