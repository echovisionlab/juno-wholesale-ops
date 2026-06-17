const defaultJunoBaseUrl = "https://www.juno.co.uk";

export function normalizeJunoId(junoId: string): string {
  const normalized = junoId.trim();
  if (!/^\d+-\d{1,3}$/.test(normalized)) {
    throw new Error(`Invalid Juno ID: ${junoId}`);
  }
  return normalized;
}

export function buildJunoProductUrl(junoId: string, baseUrl = defaultJunoBaseUrl): string {
  const url = new URL(`/products/${normalizeJunoId(junoId)}/`, baseUrl);
  return url.toString();
}
