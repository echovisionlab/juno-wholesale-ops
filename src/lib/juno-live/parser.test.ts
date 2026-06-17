import { describe, expect, it } from "vitest";
import { junoProductParserVersion, parseJunoProductHtml } from "./parser";

describe("parseJunoProductHtml", () => {
  it("extracts in-stock quantity, display text, final URL, and wholesale price", () => {
    const parsed = parseJunoProductHtml(
      `
        <div class="product-actions-eq">
          <span>£20.63</span>
          <div class="product-availability product-availability-b">
            <em>2 in stock</em>
          </div>
        </div>
      `,
      "https://www.juno.co.uk/products/9ms-lunch-vinyl/1148569-01/",
    );

    expect(parsed).toMatchObject({
      status: "in_stock",
      stockQuantity: 2,
      stockText: "2 in stock",
      displayStock: "2 in stock",
      wholesalePriceGbp: 20.63,
      finalUrl: "https://www.juno.co.uk/products/9ms-lunch-vinyl/1148569-01/",
      parserVersion: junoProductParserVersion,
      metadata: {
        hasProductAvailability: true,
        hasPriceMatch: true,
      },
    });
  });

  it("classifies non-quantity stock states without inventing a quantity", () => {
    expect(parseJunoProductHtml("<main>Out of stock - email me when available £12.00</main>").status).toBe(
      "out_of_stock",
    );
    expect(parseJunoProductHtml("<main>Pre-order now</main>").status).toBe("preorder");
    expect(parseJunoProductHtml("<main>Coming soon</main>").status).toBe("coming_soon");
  });

  it("returns N/A when no stock signal is available", () => {
    const parsed = parseJunoProductHtml("<main>Lunch vinyl</main>");

    expect(parsed.status).toBe("unknown");
    expect(parsed.stockQuantity).toBeNull();
    expect(parsed.displayStock).toBe("N/A");
    expect(parsed.wholesalePriceGbp).toBeNull();
  });

  it("detects blocked challenge pages before parsing product content", () => {
    const parsed = parseJunoProductHtml("<title>Just a moment...</title><main>Cloudflare captcha</main>");

    expect(parsed.status).toBe("blocked");
    expect(parsed.metadata).toEqual({ reason: "challenge_or_captcha" });
  });

  it("decodes pound entities and falls back to page-level price extraction", () => {
    const parsed = parseJunoProductHtml("<main>&#163;1,234.50 <span>3&nbsp;in stock</span></main>");

    expect(parsed.status).toBe("in_stock");
    expect(parsed.stockQuantity).toBe(3);
    expect(parsed.wholesalePriceGbp).toBe(1234.5);
  });
});
