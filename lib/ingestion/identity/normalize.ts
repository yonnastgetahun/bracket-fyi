export const IDENTITY_NORMALIZATION_VERSION = "identity-normalization-v1" as const;

const apostropheVariants = /[\u2018\u2019\u201A\u201B\u2032\uFF07]/gu;
const dashVariants = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/gu;
const separators = /[^\p{L}\p{N}\p{M}'\s-]/gu;

function validateLocale(locale: string): string {
  const normalizedLocale = locale.trim();
  if (!normalizedLocale) throw new Error("Identity normalization requires a BCP-47 locale");
  try {
    return new Intl.Locale(normalizedLocale).toString();
  } catch {
    throw new Error(`Invalid BCP-47 locale: ${locale}`);
  }
}

export function normalizeIdentityText(input: string, locale: string): string {
  const validatedLocale = validateLocale(locale);
  return input
    .normalize("NFKC")
    .replace(apostropheVariants, "'")
    .replace(dashVariants, " ")
    .toLocaleLowerCase(validatedLocale)
    .replace(/-/gu, " ")
    .replace(separators, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
