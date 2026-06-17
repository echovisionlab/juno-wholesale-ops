import { normalizeCatalogText } from "./normalize";

export type WatchRuleType = "artist" | "label" | "genre" | "keyword" | "exclude_keyword";

export type WatchRule = {
  id: string;
  type: WatchRuleType;
  pattern: string;
  patternNorm: string;
  weight: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WatchableCatalogItem = {
  artist: string | null;
  title: string | null;
  label: string | null;
  genre: string | null;
  medium: string | null;
  description: string | null;
  catNo: string | null;
};

export type WatchMatchCandidate = {
  rule: WatchRule;
  matchedField: string;
  score: number;
  reason: string;
};

const keywordFields = [
  "artist",
  "title",
  "label",
  "genre",
  "medium",
  "description",
  "catNo",
] as const;

export function matchWatchRulesForItem(
  item: WatchableCatalogItem,
  rules: WatchRule[],
): WatchMatchCandidate[] {
  return rules
    .filter((rule) => rule.enabled)
    .flatMap((rule) => matchWatchRuleForItem(item, rule));
}

export function matchWatchRuleForItem(
  item: WatchableCatalogItem,
  rule: WatchRule,
): WatchMatchCandidate[] {
  if (!rule.enabled) {
    return [];
  }

  if (rule.type === "artist") {
    return exactMatch({ value: item.artist, field: "artist", rule });
  }

  if (rule.type === "label") {
    return exactMatch({ value: item.label, field: "label", rule });
  }

  if (rule.type === "genre") {
    return exactMatch({ value: item.genre, field: "genre", rule });
  }

  return keywordFields.flatMap((field) => substringMatch({ value: item[field], field, rule }));
}

export function summarizeWatchScore(matches: WatchMatchCandidate[]): {
  positiveScore: number;
  excludeScore: number;
  totalScore: number;
} {
  const positiveScore = matches
    .filter((match) => match.rule.type !== "exclude_keyword")
    .reduce((sum, match) => sum + match.score, 0);
  const excludeScore = matches
    .filter((match) => match.rule.type === "exclude_keyword")
    .reduce((sum, match) => sum + match.score, 0);

  return {
    positiveScore,
    excludeScore,
    totalScore: positiveScore + excludeScore,
  };
}

function exactMatch(options: {
  value: string | null;
  field: string;
  rule: WatchRule;
}): WatchMatchCandidate[] {
  if (normalizeCatalogText(options.value) !== options.rule.patternNorm) {
    return [];
  }

  return [
    {
      rule: options.rule,
      matchedField: options.field,
      score: options.rule.weight,
      reason: `${fieldLabel(options.field)} exactly matches "${options.rule.pattern}".`,
    },
  ];
}

function substringMatch(options: {
  value: string | null;
  field: string;
  rule: WatchRule;
}): WatchMatchCandidate[] {
  const normalizedValue = normalizeCatalogText(options.value);
  if (!normalizedValue?.includes(options.rule.patternNorm)) {
    return [];
  }

  return [
    {
      rule: options.rule,
      matchedField: options.field,
      score: options.rule.weight,
      reason: `${fieldLabel(options.field)} contains "${options.rule.pattern}".`,
    },
  ];
}

function fieldLabel(field: string): string {
  if (field === "catNo") {
    return "Cat no";
  }
  return `${field.slice(0, 1).toUpperCase()}${field.slice(1)}`;
}
