/**
 * Les illustrations que la lecture de la table apprend. Le navigateur doit en
 * lire les pixels, ce que l'hébergeur des images n'autorise pas depuis un autre
 * site : elles passent par une route de Joutes (`…/play/filmed/art/<carte>`).
 */

/** La largeur demandée : la lecture réduit de toute façon l'image à 260 pixels. */
export const ART_WIDTH = 372;

const CARD_ID = /^[A-Za-z]{2,5}-?\d{1,4}[a-z*]{0,3}$/;

export function isCardId(value: string): boolean {
  return CARD_ID.test(value);
}

export function artUrl(cardId: string): string {
  return `/api/games/riftbound/play/filmed/art/${encodeURIComponent(cardId)}`;
}

/** Les hébergeurs d'où une illustration du catalogue peut venir. */
const HOSTS = ["cmsassets.rgpub.io", "uiez8a3cxaj4q4wl.public.blob.vercel-storage.com"];

/**
 * L'adresse à télécharger pour une illustration du catalogue, en vignette
 * quand l'hébergeur sait la réduire. `null` : pas une adresse qu'on relaie.
 */
export function artSource(image: string | undefined): string | null {
  if (!image) return null;
  let url: URL;
  try {
    url = new URL(image);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !HOSTS.includes(url.hostname)) return null;
  if (url.hostname === "cmsassets.rgpub.io") url.searchParams.set("w", String(ART_WIDTH));
  return url.toString();
}
