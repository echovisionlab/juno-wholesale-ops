export type IdentityInput = {
  junoId?: string | null;
  barcode?: string | null;
  artist?: string | null;
  title?: string | null;
  label?: string | null;
  catNo?: string | null;
};

export type NormalizedIdentityInput = {
  junoId: string | null;
  barcode: string | null;
  artistNorm: string | null;
  titleNorm: string | null;
  labelNorm: string | null;
  catNoNorm: string | null;
};

export function normalizeCatalogText(value: string | null | undefined): string | null {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? normalized : null;
}

export function normalizeIdentityInput(input: IdentityInput): NormalizedIdentityInput {
  return {
    junoId: normalizeCatalogText(input.junoId),
    barcode: normalizeCatalogText(input.barcode),
    artistNorm: normalizeCatalogText(input.artist),
    titleNorm: normalizeCatalogText(input.title),
    labelNorm: normalizeCatalogText(input.label),
    catNoNorm: normalizeCatalogText(input.catNo),
  };
}

export function buildCatalogIdentityKey(input: IdentityInput): string | null {
  const normalized = normalizeIdentityInput(input);

  if (normalized.junoId) {
    return `juno:${normalized.junoId}`;
  }

  if (normalized.barcode) {
    return `barcode:${normalized.barcode}`;
  }

  if (normalized.labelNorm && normalized.catNoNorm) {
    return `cat:${normalized.labelNorm}:${normalized.catNoNorm}`;
  }

  if (normalized.artistNorm && normalized.titleNorm && normalized.labelNorm) {
    return `text:${normalized.artistNorm}:${normalized.titleNorm}:${normalized.labelNorm}`;
  }

  return null;
}
