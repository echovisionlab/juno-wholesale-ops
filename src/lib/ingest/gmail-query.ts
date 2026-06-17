export type GmailIngestQueryPlan = {
  query: string;
  windowFrom: string | null;
  windowTo: string;
  incremental: boolean;
};

const gmailDateFilterPattern = /(?:^|\s)(?:after|before|newer_than|older_than):\S+/gi;

export function buildGmailIngestQueryPlan(options: {
  baseQuery: string;
  lastSuccessfulMessageReceivedAt: string | null | undefined;
  lookbackMs: number;
  now?: Date;
}): GmailIngestQueryPlan {
  const now = options.now ?? new Date();
  const windowTo = now.toISOString();

  if (!options.lastSuccessfulMessageReceivedAt) {
    return {
      query: normalizeGmailQuery(options.baseQuery),
      windowFrom: null,
      windowTo,
      incremental: false,
    };
  }

  const lastReceivedAt = new Date(options.lastSuccessfulMessageReceivedAt);
  const windowFromDate = new Date(Math.max(0, lastReceivedAt.getTime() - options.lookbackMs));
  const queryWithoutDateFilters = removeGmailDateFilters(options.baseQuery);

  return {
    query: normalizeGmailQuery(`${queryWithoutDateFilters} after:${formatGmailSearchDate(windowFromDate)}`),
    windowFrom: windowFromDate.toISOString(),
    windowTo,
    incremental: true,
  };
}

export function removeGmailDateFilters(query: string): string {
  return normalizeGmailQuery(query.replace(gmailDateFilterPattern, " "));
}

function normalizeGmailQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

function formatGmailSearchDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "/");
}
