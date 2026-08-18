import { defineRouting } from "next-intl/routing";

import { defaultLocale, locales } from "@/i18n/config";

/**
 * La langue vit désormais dans l'URL, seule façon d'avoir une coquille statique :
 * celle-ci se préfabrique par URL, alors qu'une langue portée par un cookie fait
 * rendre la même adresse différemment selon le visiteur.
 *
 * `as-needed` garde le français — la langue par défaut — sans préfixe : `/about`
 * reste `/about`, et les autres langues prennent le leur (`/en/about`). Aucune
 * adresse existante ne change, donc rien à rediriger ni à réindexer.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
});
