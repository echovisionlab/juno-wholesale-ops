export type JunoLiveStatus =
  | "in_stock"
  | "out_of_stock"
  | "preorder"
  | "coming_soon"
  | "unknown"
  | "failed"
  | "blocked";

export type ParsedJunoProductPage = {
  status: JunoLiveStatus;
  stockQuantity: number | null;
  stockText: string | null;
  displayStock: string;
  wholesalePriceGbp: number | null;
  finalUrl: string | null;
  parserVersion: string;
  metadata: Record<string, unknown>;
};

export const junoProductParserVersion = "juno-product-html-v1";

export function parseJunoProductHtml(html: string, finalUrl: string | null = null): ParsedJunoProductPage {
  if (isBlockedHtml(html)) {
    return buildResult("blocked", null, null, null, finalUrl, { reason: "challenge_or_captcha" });
  }

  const text = stripHtml(html);
  const stockText = extractStockText(text);
  const status = inferStatus(text, stockText);
  const stockQuantity = stockText ? Number.parseInt(stockText, 10) : null;
  const wholesalePriceGbp = extractWholesalePrice(html, text);

  return buildResult(status, stockQuantity, stockText, wholesalePriceGbp, finalUrl, {
    hasProductAvailability: /product-availability/i.test(html),
    hasPriceMatch: wholesalePriceGbp !== null,
  });
}

function buildResult(
  status: JunoLiveStatus,
  stockQuantity: number | null,
  stockText: string | null,
  wholesalePriceGbp: number | null,
  finalUrl: string | null,
  metadata: Record<string, unknown>,
): ParsedJunoProductPage {
  return {
    status,
    stockQuantity,
    stockText,
    displayStock: stockText ?? "N/A",
    wholesalePriceGbp,
    finalUrl,
    parserVersion: junoProductParserVersion,
    metadata,
  };
}

function inferStatus(text: string, stockText: string | null): JunoLiveStatus {
  const lower = text.toLowerCase();
  if (stockText) {
    return "in_stock";
  }
  if (/\bpre[-\s]?order\b/.test(lower)) {
    return "preorder";
  }
  if (/\bcoming soon\b/.test(lower)) {
    return "coming_soon";
  }
  if (/\bout of stock\b|\be-?mail me when available\b|\bback[-\s]?in[-\s]?stock alert\b/.test(lower)) {
    return "out_of_stock";
  }
  return "unknown";
}

function extractStockText(text: string): string | null {
  const match = text.match(/\b(\d+)\s+in stock\b/i);
  return match ? `${match[1]} in stock` : null;
}

function extractWholesalePrice(html: string, text: string): number | null {
  const scoped = html.match(/class=["'][^"']*product-actions-eq[^"']*["'][\s\S]{0,5000}?<\/div>\s*<\/div>/i)?.[0];
  const sourceText = scoped ? stripHtml(scoped) : text;
  const match = sourceText.match(/£\s?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function isBlockedHtml(html: string): boolean {
  return /Just a moment|cf-chl|Cloudflare|captcha/i.test(html);
}

function stripHtml(html: string): string {
  return decodeEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&pound;|&#163;/gi, "£")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}
