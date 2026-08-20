/**
 * Les URLs venues du lieu, avant de les poser dans le DOM.
 *
 * Un lieu renseigne lui-même son site, ses réseaux, les liens de ses annonces
 * et sa vidéo de présentation. Ces valeurs traversent la base et ressortent
 * dans des `href` et des `src` : `javascript:` et `data:` y trouveraient une
 * exécution au clic, et une validation `url()` seule les laisse passer — le
 * dépôt le note déjà dans `lib/schemas/news.schema.ts`.
 *
 * Le filtre est posé au rendu, et non seulement à l'écriture : il protège
 * aussi ce qui est déjà en base, et l'écran de configuration du lieu n'existe
 * pas encore pour valider en amont.
 */

/** L'URL si elle est en http(s), `null` sinon — y compris pour une chaîne vide. */
export function externalUrl(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Les hôtes dont on accepte d'intégrer un lecteur.
 *
 * Une liste fermée plutôt qu'un simple `https:` : une `iframe` donne à l'hôte
 * appelé la pleine page qu'il rend, et une vidéo de présentation n'a aucune
 * raison de venir d'ailleurs que d'une plateforme vidéo.
 */
const EMBED_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "player.twitch.tv",
  "player.vimeo.com",
  "www.dailymotion.com",
  "geo.dailymotion.com",
];

/**
 * L'URL d'un lecteur intégrable, ou `null`.
 *
 * Les formes publiques de YouTube — `watch?v=`, `youtu.be`, `/live/` — sont
 * traduites en URL de lecteur : c'est celle qu'un gérant a sous la main quand
 * il copie le lien de sa vidéo, et refuser de l'afficher pour cette raison
 * serait incompréhensible.
 */
export function embedVideoUrl(value: string | undefined | null): string | null {
  const url = externalUrl(value);
  if (!url) {
    return null;
  }

  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();

  if (host === "youtu.be" || host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com") {
    const segments = parsed.pathname.split("/").filter(Boolean);
    const videoId =
      host === "youtu.be"
        ? segments[0]
        : (parsed.searchParams.get("v") ??
          (segments[0] === "live" || segments[0] === "embed" ? segments[1] : null));

    if (videoId) {
      return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
    }
  }

  return EMBED_HOSTS.includes(host) && parsed.protocol === "https:" ? url : null;
}
