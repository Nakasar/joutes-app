/**
 * Le centre des contributions de l'administration : tout ce que les joueurs
 * ont publié, toutes collections confondues, du plus récent au plus ancien.
 *
 * Module pur, sans accès à la base : l'ordre, le curseur et la fusion des
 * sources sont ce qui mérite d'être testé, et `lib/db/*` ouvre une connexion
 * MongoDB au chargement (voir `lib/users/admin-search.ts`).
 *
 * **Ce qui compte comme contribution.** Ce qu'un joueur a mis sous les yeux
 * d'autres joueurs : les contenus que l'on peut signaler
 * (`REPORTABLE_CONTENT_TYPES`), plus les publications et annonces des groupes
 * de jeu, qui vivent dans le document du groupe. En sont exclus :
 * - ce qui est resté privé — brouillons de publication, decks et listes de
 *   souhaits privés : rien n'a été publié ;
 * - les profils (une biographie n'est pas un message) et les listes de vente,
 *   qu'un compte reçoit vide à la première visite ;
 * - les évènements importés par les lieux (scraping, Hobbynext, Riftbound) :
 *   personne ne les a écrits.
 */

export const CONTRIBUTION_KINDS = [
  "user-content",
  "errata",
  "policy",
  "news",
  "quiz",
  "deck",
  "wishlist",
  "event",
  "tournament",
  "league",
  "lair",
  "play-group",
  "play-group-content",
  "play-group-announcement",
] as const;

export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number];

export const CONTRIBUTION_KIND_LABELS: Record<ContributionKind, string> = {
  "user-content": "Publication d'un joueur",
  errata: "Errata et rulings",
  policy: "Politique de jeu",
  news: "Actualité",
  quiz: "Quizz",
  deck: "Deck",
  wishlist: "Liste de souhaits",
  event: "Évènement",
  tournament: "Tournoi",
  league: "Ligue",
  lair: "Lieu",
  "play-group": "Groupe de jeu",
  "play-group-content": "Publication d'un groupe",
  "play-group-announcement": "Annonce d'un groupe",
};

export type Contribution = {
  kind: ContributionKind;
  /** Unique dans son type ; deux types peuvent partager un identifiant. */
  id: string;
  title: string;
  /** Précision courte affichée à côté du type : « Ruling », « Non répertorié »… */
  detail?: string;
  excerpt?: string;
  /** Absent quand le contenu ne dit pas qui l'a écrit. */
  authorId?: string;
  publishedAt: Date;
  url?: string;
};

/** Le nombre de lignes d'une page. */
export const CONTRIBUTIONS_PAGE_SIZE = 30;

const MAX_EXCERPT_LENGTH = 200;

export function contributionExcerpt(text: unknown): string | undefined {
  if (typeof text !== "string") {
    return undefined;
  }

  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) {
    return undefined;
  }

  return flat.length > MAX_EXCERPT_LENGTH ? `${flat.slice(0, MAX_EXCERPT_LENGTH)}…` : flat;
}

/**
 * Où reprendre la lecture : la dernière ligne affichée.
 *
 * Une date seule ne suffit pas : les contenus datés par leur `_id` le sont à
 * la seconde, et deux évènements créés ensemble partagent la même. Le type et
 * l'identifiant départagent, dans le même ordre que `compareContributions`.
 */
export type ContributionCursor = {
  publishedAt: Date;
  kind: ContributionKind;
  id: string;
};

/** Plus récent d'abord ; à date égale, un ordre fixe, pour que les pages ne se recouvrent pas. */
export function compareContributions(a: ContributionCursor, b: ContributionCursor): number {
  const byDate = b.publishedAt.getTime() - a.publishedAt.getTime();
  if (byDate !== 0) return byDate;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function encodeContributionCursor(cursor: ContributionCursor): string {
  return `${cursor.publishedAt.getTime()}~${cursor.kind}~${cursor.id}`;
}

/** Un curseur illisible vaut l'absence de curseur : la première page. */
export function decodeContributionCursor(value: string | undefined): ContributionCursor | null {
  if (!value) return null;

  const [time, kind, ...rest] = value.split("~");
  const id = rest.join("~");
  const ms = Number(time);

  if (!Number.isFinite(ms) || !id || !CONTRIBUTION_KINDS.includes(kind as ContributionKind)) {
    return null;
  }

  return { publishedAt: new Date(ms), kind: kind as ContributionKind, id };
}

/** Les types demandés par l'URL, ramenés à ceux que l'on connaît ; aucun vaut tous. */
export function readContributionKinds(value: string | string[] | undefined): ContributionKind[] {
  const values = (Array.isArray(value) ? value : value ? value.split(",") : []).filter(
    (kind): kind is ContributionKind => CONTRIBUTION_KINDS.includes(kind as ContributionKind),
  );

  return values.length > 0 ? [...new Set(values)] : [...CONTRIBUTION_KINDS];
}

/**
 * Fusionne ce que chaque source a renvoyé en une page.
 *
 * Chaque source a lu, triées, les lignes datées au plus tard du curseur — à
 * la même date, elle ne peut pas savoir lesquelles sont déjà passées. C'est
 * ici qu'on écarte tout ce qui précède le curseur, ou l'égale.
 */
export function mergeContributionPages(
  sources: Contribution[][],
  { after, limit }: { after: ContributionCursor | null; limit: number },
): { items: Contribution[]; next: ContributionCursor | null } {
  const all = sources
    .flat()
    .filter((item) => !after || compareContributions(after, item) < 0)
    .sort(compareContributions);

  const items = all.slice(0, limit);
  const last = items[items.length - 1];

  return {
    items,
    next:
      all.length > limit && last ? { publishedAt: last.publishedAt, kind: last.kind, id: last.id } : null,
  };
}
