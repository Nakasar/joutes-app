import type { PlayGroupPlace, PlayGroupVisibility } from "@/lib/types/PlayGroup";

/**
 * L'exploration des groupes de jeu : ce qui se classe, et comment.
 *
 * Tout ce module est pur — il ne connaît ni la base ni React. C'est ce qui
 * permet de verrouiller par des tests le seul endroit où l'ordre de la page se
 * décide, plutôt que de le vérifier à l'œil sur une capture.
 */

/** Les trois ordres de la page. « vifs » est celui par défaut. */
export const EXPLORE_ORDERS = ["vifs", "proches", "neufs"] as const;

export type ExploreOrder = (typeof EXPLORE_ORDERS)[number];

export function readExploreOrder(value: string | undefined | null): ExploreOrder {
  return EXPLORE_ORDERS.includes(value as ExploreOrder) ? (value as ExploreOrder) : "vifs";
}

/** Ce que la page connaît d'un groupe. */
export type ExploreGroup = {
  id: string;
  name: string;
  initials: string;
  /**
   * Un groupe privé n'arrive ici que pour ses membres : la ligne le dit, sans
   * quoi celui qui a posé le réglage ne saurait pas lequel de ses groupes est
   * caché aux autres.
   */
  visibility: PlayGroupVisibility;
  tagline: string | null;
  accentColor: string | null;
  logo: string | null;
  rhythmLabel: string | null;
  place: PlayGroupPlace | null;
  /** Les coordonnées du lieu par défaut — un lieu Joutes seulement en porte. */
  placeCoordinates: { longitude: number; latitude: number } | null;
  gameNames: string[];
  memberCount: number;
  followerCount: number;
  publishedCount: number;
  /** Les directs en cours, déjà réduits à ce que la page affiche. */
  lives: ExploreLive[];
  /** Le dernier signe de vie hors direct, s'il y en a un. */
  lastDeed: ExploreDeed | null;
  /** ISO 8601 — sert au classement « les derniers venus ». */
  createdAt: string;
  activityRank: number;
};

export type ExploreLive = {
  groupId: string;
  groupName: string;
  initials: string;
  accentColor: string | null;
  title: string | null;
  streamer: string;
  gameName: string | null;
  viewers: number | null;
  startedAt: string;
  channelUrl: string;
  thumbnailUrl: string;
};

export type ExploreDeedKind = "content" | "session" | "announcement";

export type ExploreDeed = {
  kind: ExploreDeedKind;
  /** ISO 8601. */
  at: string;
  /** Le titre de l'article, de la vidéo ou de l'annonce ; absent pour une session. */
  label: string | null;
};

/** Une publication mise en avant par « Les hérauts ». */
export type ExplorePost = {
  id: string;
  groupId: string;
  groupName: string;
  initials: string;
  accentColor: string | null;
  kind: "article" | "video" | "replay";
  title: string;
  summary: string | null;
  thumbnail: string | null;
  duration: string | null;
  publishedAt: string;
  /** Où mène la carte : la vitrine pour un article, la plateforme sinon. */
  href: string | null;
  url: string | null;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * L'âge au-delà duquel un direct déclaré ne compte plus.
 *
 * Rien ne retire un direct automatiquement : un membre le déclare, un
 * responsable l'enlève. Un direct oublié épinglerait donc son groupe en tête du
 * rôle pour toujours — alors qu'une publication, elle, perd sa valeur en trente
 * jours. Vingt-quatre heures laissent passer un marathon et écartent l'oubli.
 */
export const LIVE_MAX_AGE_HOURS = 24;

/** Un direct déclaré diffuse-t-il encore, ou a-t-il été oublié ? */
export function isFreshLive(startedAt: string | null | undefined, now: number): boolean {
  const time = readTime(startedAt);
  if (time === null) {
    return false;
  }

  return now - time <= LIVE_MAX_AGE_HOURS * 60 * 60 * 1000;
}

/**
 * Le rang d'activité — l'ordre par défaut de la page.
 *
 * Un direct passe devant tout : c'est le seul signe de vie qu'on peut rejoindre
 * dans la minute. Vient ensuite ce qui est daté — une publication récente, une
 * session à venir — dont la valeur décroît avec le temps plutôt que de basculer
 * d'un coup : un article d'hier et un article de la semaine dernière ne disent
 * pas la même chose, et un seuil les rendrait égaux.
 *
 * Les groupes sans aucun signe retombent à zéro et ferment le rôle, sans jamais
 * disparaître : un groupe endormi près de chez soi reste une information utile.
 *
 * `liveCount` ne compte que les directs encore frais (`isFreshLive`) : c'est à
 * l'appelant de les filtrer, et c'est ce qui empêche un direct oublié de tenir
 * la tête du rôle indéfiniment.
 */
export function readActivityRank(input: {
  liveCount: number;
  lastDeedAt?: string | null;
  nextSessionAt?: string | null;
  now: number;
}): number {
  let rank = 0;

  if (input.liveCount > 0) {
    // 1000 met les directs hors d'atteinte du reste ; le nombre de diffuseurs
    // départage ensuite deux groupes tous deux en direct.
    rank += 1000 + Math.min(input.liveCount, 9);
  }

  const deed = readFreshness(input.lastDeedAt, input.now, 30);
  if (deed !== null) {
    rank += 400 * deed;
  }

  const session = readUpcoming(input.nextSessionAt, input.now, 21);
  if (session !== null) {
    rank += 300 * session;
  }

  return Math.round(rank);
}

/** 1 pour aujourd'hui, 0 au-delà de `windowDays`, linéaire entre les deux. */
function readFreshness(at: string | null | undefined, now: number, windowDays: number): number | null {
  const time = readTime(at);
  if (time === null) {
    return null;
  }

  const age = now - time;
  if (age < 0) {
    return 1;
  }

  return Math.max(0, 1 - age / (windowDays * DAY));
}

/**
 * Comme `readFreshness`, mais pour une date à venir : passée, elle ne compte
 * plus. Une session déjà commencée mais pas terminée est datée à `now` par
 * l'appelant, et vaut donc le maximum — c'est le moment où le groupe joue.
 */
function readUpcoming(at: string | null | undefined, now: number, windowDays: number): number | null {
  const time = readTime(at);
  if (time === null) {
    return null;
  }

  const wait = time - now;
  if (wait < 0) {
    return null;
  }

  return Math.max(0, 1 - wait / (windowDays * DAY));
}

function readTime(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/**
 * Le texte réduit à sa forme cherchable.
 *
 * Sans accents et sans casse : « mediatheque » doit trouver la Médiathèque, et
 * personne ne tape « Dé » avec son accent dans un champ de recherche.
 */
export function foldSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Le texte d'un groupe où la recherche va chercher. */
export function readSearchHaystack(group: ExploreGroup): string {
  return foldSearchText(
    [group.name, group.tagline ?? "", group.rhythmLabel ?? "", group.place?.label ?? "", group.gameNames.join(" ")].join(
      " ",
    ),
  );
}

export function matchesExploreQuery(group: ExploreGroup, foldedQuery: string): boolean {
  return foldedQuery === "" || readSearchHaystack(group).includes(foldedQuery);
}

/** La distance à vol d'oiseau, en kilomètres (formule de haversine). */
export function distanceKm(
  a: { longitude: number; latitude: number },
  b: { longitude: number; latitude: number },
): number {
  const R = 6371;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Le classement du rôle.
 *
 * « proches » ne peut ordonner que les groupes dont le lieu par défaut est un
 * lieu Joutes : lui seul porte une adresse géocodée. Les autres ne sont pas
 * placés à zéro kilomètre — ce serait mentir — mais renvoyés en fin de liste,
 * entre eux classés par activité. Sans position connue, l'ordre retombe sur
 * l'activité plutôt que de rendre une liste arbitraire.
 */
export function sortExploreGroups(
  groups: ExploreGroup[],
  order: ExploreOrder,
  origin?: { longitude: number; latitude: number } | null,
): ExploreGroup[] {
  const sorted = groups.slice();

  if (order === "neufs") {
    return sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.name.localeCompare(b.name));
  }

  if (order === "proches" && origin) {
    return sorted.sort((a, b) => {
      const left = a.placeCoordinates ? distanceKm(origin, a.placeCoordinates) : null;
      const right = b.placeCoordinates ? distanceKm(origin, b.placeCoordinates) : null;

      if (left === null || right === null) {
        if (left !== right) {
          return left === null ? 1 : -1;
        }

        return b.activityRank - a.activityRank || a.name.localeCompare(b.name);
      }

      return left - right || a.name.localeCompare(b.name);
    });
  }

  return sorted.sort((a, b) => b.activityRank - a.activityRank || a.name.localeCompare(b.name));
}

/** Les initiales portées par l'écu — deux lettres au plus. */
export function readInitials(name: string): string {
  const words = name
    .split(/[\s'’-]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0 && !SMALL_WORDS.has(foldSearchText(word)));

  const letters = (words.length > 0 ? words : [name]).map((word) => word[0]).filter((letter) => /\p{L}/u.test(letter));

  return letters.slice(0, 2).join("").toUpperCase() || "?";
}

/** « Les Corbeaux de Thionville » doit donner CT, pas LC. */
const SMALL_WORDS = new Set(["le", "la", "les", "l", "de", "des", "du", "d", "the", "of", "et", "a", "au", "aux"]);
