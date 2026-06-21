import { chromium, type BrowserContext } from "playwright";
import type { AppLogger } from "@/lib/logging/logger";
import type { BrowserLookupResult, JunoLiveBrowser, JunoSessionState } from "./lookup-runner";

export type PlaywrightJunoBrowserOptions = {
  profileDir: string;
  headless: boolean;
  loginEmail?: string;
  loginPassword?: string;
  logger: AppLogger;
};

export class PlaywrightJunoBrowser implements JunoLiveBrowser {
  private context: BrowserContext | null = null;

  constructor(private readonly options: PlaywrightJunoBrowserOptions) {}

  async ensureLoggedIn(): Promise<JunoSessionState> {
    const context = await this.getContext();
    const page = await context.newPage();
    try {
      await page.goto("https://www.juno.co.uk/account/", {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      const html = await page.content();
      if (isChallenge(html)) {
        return { status: "blocked", error: "challenge_or_captcha" };
      }
      if (!isLoginPage(page.url(), html)) {
        return { status: "authenticated" };
      }
      if (!this.options.loginEmail || !this.options.loginPassword) {
        return { status: "failed", error: "missing_juno_credentials" };
      }
      await this.options.logger.info("login.start", { url: page.url(), emailConfigured: true });
      await page.getByLabel(/e-?mail address/i).fill(this.options.loginEmail);
      await page.getByLabel(/password/i).fill(this.options.loginPassword);
      await page.getByRole("button", { name: /log in/i }).click();
      await page.waitForLoadState("domcontentloaded", { timeout: 45000 }).catch(() => undefined);
      const afterLoginHtml = await page.content();
      if (isChallenge(afterLoginHtml)) {
        return { status: "blocked", error: "challenge_or_captcha" };
      }
      if (isLoginPage(page.url(), afterLoginHtml)) {
        return { status: "failed", error: "login_form_still_visible" };
      }
      return { status: "login_required" };
    } catch (error) {
      return { status: "failed", error: error instanceof Error ? error.message : String(error) };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async getProductPage(productUrl: string, timeoutMs: number): Promise<BrowserLookupResult> {
    const context = await this.getContext();
    const page = await context.newPage();
    try {
      await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      const html = await page.content();
      const finalUrl = page.url();
      if (isChallenge(html)) {
        return { status: "blocked", finalUrl, error: "challenge_or_captcha" };
      }
      return { status: "ok", html, finalUrl };
    } catch (error) {
      return {
        status: "failed",
        finalUrl: page.url(),
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = null;
  }

  private async getContext(): Promise<BrowserContext> {
    if (this.context) {
      return this.context;
    }
    await this.options.logger.info("browser.launch", {
      profileDir: this.options.profileDir,
      headless: this.options.headless,
    });
    this.context = await chromium.launchPersistentContext(this.options.profileDir, {
      headless: this.options.headless,
      viewport: { width: 1280, height: 720 },
      locale: "en-GB",
    });
    return this.context;
  }
}

function isLoginPage(url: string, html: string): boolean {
  return /\/login\b/i.test(url) || (/e-?mail address/i.test(html) && /password/i.test(html));
}

function isChallenge(html: string): boolean {
  return /Just a moment|cf-chl|Cloudflare|captcha/i.test(html);
}
