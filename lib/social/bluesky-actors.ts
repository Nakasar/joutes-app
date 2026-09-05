/**
 * Un compte Bluesky désigné par son adresse, et les adresses qu'on en tire.
 *
 * Pendant exact de `lib/streams/youtube-channels.ts` : l'administration colle
 * sur la fiche du jeu ce qu'un humain a sous la main —
 * `bsky.app/profile/riftbound.bsky.social` — et il faut savoir en tirer
 * l'`actor` que l'API attend, sans réseau et sans deviner.
 *
 * ## Le handle ne sert qu'à l'affichage
 *
 * Un compte Bluesky a deux noms : un **DID** (`did:plc:…`), attribué à vie, et
 * un **handle** (`riftbound.bsky.social`), qui n'est qu'un nom de domaine
 * vérifié — donc qui change. Un éditeur qui passe de `x.bsky.social` à
 * `riftbound.gg` garde son DID et casse tous les liens bâtis sur son handle.
 *
 * D'où la règle appliquée partout dans ce dossier : **les permaliens se
 * construisent sur le DID**, que `bsky.app` accepte tout aussi bien, et le
 * handle n'est écrit que sous la vignette. Un lien laid vaut mieux qu'un lien
 * mort, d'autant qu'il n'est jamais montré en toutes lettres.
 */

/** L'`actor` que l'API accepte : un handle ou un DID, elle ne distingue pas. */
export type BlueskyActor = { actor: string };

const BLUESKY_HOSTS = ["bsky.app", "staging.bsky.app"];

/**
 * Le compte désigné par cette adresse, ou `null`.
 *
 * Refuse tout ce qui n'est **pas** un compte — une publication
 * (`/profile/x/post/y`), un flux, un autre site — plutôt que de deviner. Même
 * refus que `readYouTubeChannelRef` pour une URL de vidéo, et pour la même
 * raison : remonter d'une publication à son auteur demanderait un appel de plus
 * pour un résultat que personne n'a demandé.
 */
export function readBlueskyActor(url: string | undefined | null): BlueskyActor | null {
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
  if (!BLUESKY_HOSTS.includes(host)) {
    return null;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);

  // Exactement `/profile/<acteur>` : un segment de plus et c'est une
  // publication, un flux ou une liste, pas le compte.
  if (segments.length !== 2 || segments[0] !== "profile") {
    return null;
  }

  const actor = decodeSegment(segments[1]);

  // Un handle est un nom de domaine, un DID commence par `did:`. Tout le reste
  // — un pseudonyme nu, un fragment recopié de travers — n'est ni l'un ni
  // l'autre, et l'API répondrait 400.
  if (!actor || (!actor.startsWith("did:") && !actor.includes("."))) {
    return null;
  }

  return { actor };
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** L'identité d'une publication, lue dans son URI `at://`. */
export type BlueskyPostRef = { did: string; rkey: string };

/**
 * Le couple qui identifie une publication.
 *
 * Le `rkey` **seul ne suffit pas** : c'est un identifiant unique *dans un
 * dépôt*, pas dans le réseau. Deux comptes peuvent porter le même, et l'employer
 * seul comme clé d'unicité ferait se recouvrir deux publications distinctes.
 */
export function readBlueskyPostUri(uri: string | undefined | null): BlueskyPostRef | null {
  if (!uri || !uri.startsWith("at://")) {
    return null;
  }

  const [did, collection, rkey] = uri.slice("at://".length).split("/");

  if (!did || !did.startsWith("did:") || collection !== "app.bsky.feed.post" || !rkey) {
    return null;
  }

  return { did, rkey };
}

/**
 * Un segment d'adresse, échappé — mais sans toucher aux deux-points.
 *
 * `encodeURIComponent` les transforme en `%3A`, ce qui donne
 * `profile/did%3Aplc%3A…` : l'adresse fonctionne, mais elle n'est pas celle que
 * `bsky.app` écrit lui-même, et un DID est illisible sous cette forme. Or les
 * deux-points sont **légaux** dans un segment de chemin (RFC 3986, `pchar`),
 * et un DID n'est fait que de caractères sûrs. On les rétablit donc, sans
 * renoncer à l'échappement pour tout le reste.
 */
function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/%3A/g, ":");
}

/** L'adresse publique d'un compte. Bâtie sur le DID : elle ne casse jamais. */
export function blueskyProfileUrl(did: string): string {
  return `https://bsky.app/profile/${encodePathSegment(did)}`;
}

/** Le permalien d'une publication. Bâti sur le DID, pour la même raison. */
export function blueskyPostUrl(did: string, rkey: string): string {
  return `https://bsky.app/profile/${encodePathSegment(did)}/post/${encodePathSegment(rkey)}`;
}

/** La clé d'unicité d'une publication : le compte **et** la clé d'enregistrement. */
export function blueskyExternalId(did: string, rkey: string): string {
  return `${did}/${rkey}`;
}
