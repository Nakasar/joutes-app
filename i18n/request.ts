import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, locales, type Locale } from "@/i18n/config";

/**
 * La langue vient du segment `[locale]` de l'URL, que le proxy a déjà résolu —
 * plus d'un cookie lu au rendu. C'est ce qui rend la coquille préfabriquable :
 * une adresse, une langue.
 *
 * `requestLocale` peut être absent (route hors du segment, appel sans locale
 * explicite) ou porter une valeur inconnue si quelqu'un forge l'URL : dans les
 * deux cas on retombe sur le français plutôt que d'échouer.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = locales.includes(requested as Locale) ? (requested as Locale) : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
