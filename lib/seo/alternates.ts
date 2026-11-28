import { defaultLocale, locales } from "@/i18n/config";

/**
 * L'adresse canonique d'une page et ses versions dans les autres langues.
 *
 * Chaque page existe en quatre langues à quatre adresses (`/…`, `/en/…`,
 * `/de/…`, `/it/…`). Sans ces balises, un moteur voit quatre pages presque
 * identiques et choisit lui-même laquelle montrer ; avec elles, chaque version
 * se déclare canonique pour sa langue et cite les autres (`hreflang`).
 *
 * Les adresses sont relatives : `metadataBase` (layout racine) y met le domaine.
 * Le français, langue par défaut, n'a pas de préfixe, et sert de `x-default`.
 */
export function localizedAlternates(path: string, locale: string) {
  const clean = path === "/" ? "" : path;
  const href = (target: string) => (target === defaultLocale ? clean || "/" : `/${target}${clean}`);

  return {
    canonical: href(locale),
    languages: {
      ...Object.fromEntries(locales.map((target) => [target, href(target)])),
      "x-default": href(defaultLocale),
    } as Record<string, string>,
  };
}
