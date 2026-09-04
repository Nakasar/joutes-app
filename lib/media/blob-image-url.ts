/**
 * Une adresse d'image que l'application accepte d'afficher.
 *
 * Seul son propre stockage est admis. Accepter une adresse quelconque
 * reviendrait à laisser un contenu public — un deck, un quizz — faire charger
 * au navigateur de chacun de ses lecteurs une image servie par un tiers, qui en
 * verrait l'adresse IP ; et `next.config.ts` ne déclare de toute façon que cet
 * hôte. Une image se dépose donc par une route de l'application, qui rend
 * l'adresse à inscrire ensuite sur le contenu.
 *
 * Le suffixe se lit avec son point : `evilpublic.blob.vercel-storage.com` n'est
 * pas un sous-domaine du stockage, et `public.blob.vercel-storage.com.ailleurs`
 * ne l'est pas davantage.
 */
export function isAppBlobImageUrl(value: string): boolean {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    url.protocol === "https:" &&
    (url.hostname === "blob.vercel-storage.com" ||
      url.hostname.endsWith(".public.blob.vercel-storage.com"))
  );
}
