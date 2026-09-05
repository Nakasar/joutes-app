/**
 * Une chaîne YouTube désignée par son adresse publique.
 *
 * Les directs des comptes Joutes partent d'une liaison OAuth, qui *donne*
 * l'identifiant `UC…` de la chaîne (`lib/streams/identity.ts`). Les chaînes des
 * éditeurs, elles, ne sont pas liées : elles sont **collées** sur la fiche du
 * jeu, sous la forme qu'un humain a sous la main — `youtube.com/@riftbound`.
 * Il faut donc savoir lire cette adresse avant de pouvoir en interroger l'état.
 *
 * Ce module ne fait que la lecture, qui est pure et se teste sans réseau. La
 * résolution d'un handle en identifiant demande un appel à l'API Data et vit
 * dans `lib/streams/youtube-api.ts`.
 */

/**
 * Ce qu'une adresse de chaîne désigne, et par quel chemin l'API sait la
 * retrouver.
 *
 * - `id` — `/channel/UC…`. Rien à résoudre, c'est déjà l'identifiant.
 * - `handle` — `/@riftbound`. `channels.list?forHandle=`.
 * - `user` — `/user/machin`, l'ancien nom de compte. `channels.list?forUsername=`.
 *
 * `/c/nom`, la forme intermédiaire, est lue comme un handle : les deux
 * coïncident dans l'immense majorité des cas, et l'API n'offre rien de mieux.
 * Un échec de résolution est de toute façon rangé sur le document et n'empêche
 * rien d'autre de tourner.
 */
export type YouTubeChannelRef = {
  kind: "id" | "handle" | "user";
  /** Pour `handle`, la valeur porte son `@` : c'est ce que `forHandle` attend. */
  value: string;
};

/** Les hôtes qui portent une chaîne YouTube. */
const CHANNEL_HOSTS = ["youtube.com", "m.youtube.com", "music.youtube.com"];

/**
 * Ce que cette adresse désigne, ou `null` si elle ne désigne pas une chaîne.
 *
 * Rend `null` — plutôt que de deviner — pour tout ce qui n'est pas une chaîne :
 * une vidéo (`watch?v=`), une playlist, un autre site. Un jeu dont le lien
 * YouTube pointe une vidéo n'a pas de chaîne à surveiller, et inventer une
 * chaîne à partir d'une vidéo demanderait un appel de plus pour un résultat
 * que personne n'a demandé.
 */
export function readYouTubeChannelRef(url: string | undefined | null): YouTubeChannelRef | null {
  if (!url) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (!CHANNEL_HOSTS.includes(host)) {
    return null;
  }

  const segments = parsed.pathname.split("/").filter(Boolean).map(decodeSegment);
  const [first, second] = segments;

  if (!first) {
    return null;
  }

  if (first.startsWith("@") && first.length > 1) {
    return { kind: "handle", value: first };
  }

  if (first === "channel" && second) {
    // Un identifiant de chaîne commence par `UC` et fait 24 caractères. Le
    // vérifier évite de partir interroger l'API avec un fragment d'URL mal
    // recopié, qui rendrait une erreur rangée sur le document pour toujours.
    return /^UC[\w-]{22}$/.test(second) ? { kind: "id", value: second } : null;
  }

  if (first === "user" && second) {
    return { kind: "user", value: second };
  }

  if (first === "c" && second) {
    return { kind: "handle", value: second.startsWith("@") ? second : `@${second}` };
  }

  return null;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Le flux Atom public d'une chaîne — les quinze dernières publications.
 *
 * C'est le même document que le sujet WebSub de `youtubeTopicUrl`, mais
 * demandé par nous au lieu d'être poussé par le hub. Il ne coûte **aucune
 * unité de quota**, ce qui est tout l'intérêt : interroger l'API pour savoir
 * si une chaîne diffuse coûterait cent unités par appel (`search.list`), soit
 * cent appels par jour pour tout le site.
 *
 * Le flux ne dit pas « direct » — il dit « publié ». Comme pour les chaînes
 * liées, c'est `videos.list` qui tranche, une unité par lot de cinquante.
 */
export function youtubeFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}
