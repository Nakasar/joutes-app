export type Locale = (typeof locales)[number];

export const locales = ["en", "fr", "it", "de"] as const;
export const defaultLocale: Locale = "fr";
