import { describe, expect, it } from "vitest";
import {
  matchWatchRuleForItem,
  matchWatchRulesForItem,
  summarizeWatchScore,
  type WatchRule,
} from "./watch-matcher";

describe("watch rule matcher", () => {
  const baseRule: Omit<WatchRule, "id" | "type" | "pattern" | "patternNorm" | "weight"> = {
    enabled: true,
    createdAt: "2026-06-17 00:00:00+00",
    updatedAt: "2026-06-17 00:00:00+00",
  };
  const item = {
    artist: "Lara Voss",
    title: "Signal Path",
    label: "Blue Note",
    genre: "Jazz",
    medium: "LP",
    description: "Limited edition with damaged sleeve note",
    catNo: "BN-101",
  };

  it("matches artist, label, and genre by exact normalized value", () => {
    expect(matchWatchRuleForItem(item, rule("artist", "Lara Voss", "lara voss", 10))).toEqual([
      expect.objectContaining({ matchedField: "artist", score: 10 }),
    ]);
    expect(matchWatchRuleForItem(item, rule("label", "Blue Note", "blue note", 5))).toEqual([
      expect.objectContaining({ matchedField: "label", score: 5 }),
    ]);
    expect(matchWatchRuleForItem(item, rule("genre", "Jazz", "jazz", 3))).toEqual([
      expect.objectContaining({ matchedField: "genre", score: 3 }),
    ]);
    expect(matchWatchRuleForItem(item, rule("artist", "Voss", "voss", 10))).toEqual([]);
  });

  it("matches keyword and exclude keyword as normalized substrings across watchable fields", () => {
    const matches = matchWatchRulesForItem(item, [
      rule("keyword", "limited edition", "limited edition", 7),
      rule("exclude_keyword", "damaged sleeve", "damaged sleeve", -20),
      { ...rule("keyword", "BN 101", "bn 101", 4), id: "cat-rule" },
      { ...rule("keyword", "blue", "blue", 8), enabled: false },
    ]);

    expect(matches).toEqual([
      expect.objectContaining({ matchedField: "description", score: 7 }),
      expect.objectContaining({ matchedField: "description", score: -20 }),
      expect.objectContaining({ matchedField: "catNo", score: 4 }),
    ]);
    expect(summarizeWatchScore(matches)).toEqual({
      positiveScore: 11,
      excludeScore: -20,
      totalScore: -9,
    });
  });

  it("does not match disabled rules or empty item fields", () => {
    expect(matchWatchRulesForItem({ ...item, description: null }, [{ ...rule("keyword", "limited", "limited", 7), enabled: false }])).toEqual([]);
    expect(matchWatchRuleForItem(item, { ...rule("keyword", "limited", "limited", 7), enabled: false })).toEqual([]);
    expect(matchWatchRuleForItem({ ...item, label: null }, rule("label", "Blue Note", "blue note", 5))).toEqual([]);
  });

  function rule(
    type: WatchRule["type"],
    pattern: string,
    patternNorm: string,
    weight: number,
  ): WatchRule {
    return {
      ...baseRule,
      id: `${type}-${patternNorm}`,
      type,
      pattern,
      patternNorm,
      weight,
    };
  }
});
