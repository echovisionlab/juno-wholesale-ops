const SUPPORTED_LOGIN_LOGO_EXTENSIONS = /\.(png|webp|svg)$/i;

export const LOGIN_LOGO_URL_REQUIREMENT = "must be an http(s) URL ending in .png, .webp, or .svg";

export function normalizeLoginLogoUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !isSupportedLoginLogoUrl(trimmed)) {
    return null;
  }
  return trimmed;
}

export function isSupportedLoginLogoUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }
    return SUPPORTED_LOGIN_LOGO_EXTENSIONS.test(url.pathname);
  } catch {
    return false;
  }
}
