import { DateTime } from "luxon";

/**
 * Ce que l'historique des échanges laisse voir, et à qui.
 *
 * Module pur, sans base : `lib/mongodb.ts` ouvre sa connexion au chargement, ce
 * qui rend `lib/db/trades.ts` intestable. La règle qui compte — un compte sans
 * abonnement ne voit que sept jours, et aucun filtre ne peut l'en faire sortir —
 * descend donc ici, où elle se prouve.
 *
 * Le point à ne pas perdre de vue : **les filtres ne sont pas seulement masqués
 * dans l'interface**. Un client peut toujours appeler l'API à la main, et sans
 * `resolveHistoryQuery` pour les écarter, un `from=2020-01-01` rendrait tout
 * l'historique à qui ne l'a pas payé. La restriction est ici, en amont de la
 * requête, et l'écran ne fait que la refléter.
 */

/** Fenêtre d'historique visible sans abonnement, en jours. */
export const TRADE_HISTORY_WINDOW_DAYS = 7;

export const TRADE_HISTORY_PAGE_SIZE = 20;
export const TRADE_HISTORY_MAX_PAGE_SIZE = 50;

export const TRADE_HISTORY_SORTS = ["recent", "oldest"] as const;
export type TradeHistorySort = (typeof TRADE_HISTORY_SORTS)[number];
export const DEFAULT_TRADE_HISTORY_SORT: TradeHistorySort = "recent";

export function isTradeHistorySort(value: string): value is TradeHistorySort {
  return (TRADE_HISTORY_SORTS as readonly string[]).includes(value);
}

/** Les filtres tels qu'ils arrivent d'un client : tout est facultatif et douteux. */
export type TradeHistoryFilters = {
  /** Nom de carte, cherché dans les deux offres. */
  card?: string | null;
  /** Nom, pseudonyme ou tag du partenaire. */
  partner?: string | null;
  from?: string | null;
  to?: string | null;
  sort?: string | null;
  page?: number | null;
  limit?: number | null;
};

/** Les noms de filtres, tels qu'ils sont signalés quand ils sont écartés. */
export type TradeHistoryFilterName = "card" | "partner" | "from" | "to" | "sort";

/** Les filtres normalisés, prêts à devenir une requête. */
export type TradeHistoryQuery = {
  card: string | null;
  partner: string | null;
  from: Date | null;
  to: Date | null;
  sort: TradeHistorySort;
  page: number;
  limit: number;
  /** Vrai quand la fenêtre de sept jours s'applique. */
  windowed: boolean;
  /** Filtres demandés mais écartés faute d'abonnement, pour pouvoir le dire. */
  dropped: TradeHistoryFilterName[];
};

/** Début de la fenêtre visible sans abonnement. */
export function historyWindowStart(now: Date): Date {
  return DateTime.fromJSDate(now).minus({ days: TRADE_HISTORY_WINDOW_DAYS }).toJSDate();
}

/**
 * Une borne de date.
 *
 * Une date seule (`2026-08-10`) désigne un jour entier, et ses bornes se
 * prennent **en UTC** : le serveur ne devine pas le fuseau de qui appelle. Un
 * client qui tient à ses propres minuits envoie un ISO complet avec décalage,
 * qui est alors repris tel quel.
 */
export function parseHistoryDate(value: string | null | undefined, edge: "start" | "end"): Date | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const parsed = DateTime.fromISO(trimmed, dateOnly ? { zone: "utc" } : {});
  if (!parsed.isValid) return null;

  if (!dateOnly) return parsed.toJSDate();

  return (edge === "start" ? parsed.startOf("day") : parsed.endOf("day")).toJSDate();
}

function trimmedOrNull(value: string | null | undefined, maxLength: number): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

/**
 * Les filtres effectifs, selon que l'appelant a droit ou non à l'historique
 * complet (`trades:full_history`).
 *
 * Sans ce droit, tout filtre est écarté et la fenêtre de sept jours est imposée
 * — non pas rognée sur ce qui était demandé, mais posée à sa place. La
 * pagination, elle, reste ouverte à tous : elle ne montre rien de plus, elle
 * parcourt ce qui est déjà visible.
 */
export function resolveHistoryQuery(
  filters: TradeHistoryFilters,
  { fullHistory, now = new Date() }: { fullHistory: boolean; now?: Date }
): TradeHistoryQuery {
  const page = Math.max(1, Math.floor(filters.page ?? 1) || 1);
  const limit = Math.min(
    TRADE_HISTORY_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(filters.limit ?? TRADE_HISTORY_PAGE_SIZE) || TRADE_HISTORY_PAGE_SIZE)
  );

  if (!fullHistory) {
    const dropped: TradeHistoryFilterName[] = [];
    if (trimmedOrNull(filters.card, 200)) dropped.push("card");
    if (trimmedOrNull(filters.partner, 200)) dropped.push("partner");
    if (parseHistoryDate(filters.from, "start")) dropped.push("from");
    if (parseHistoryDate(filters.to, "end")) dropped.push("to");
    if (filters.sort && isTradeHistorySort(filters.sort) && filters.sort !== DEFAULT_TRADE_HISTORY_SORT) {
      dropped.push("sort");
    }

    return {
      card: null,
      partner: null,
      from: historyWindowStart(now),
      to: null,
      sort: DEFAULT_TRADE_HISTORY_SORT,
      page,
      limit,
      windowed: true,
      dropped,
    };
  }

  // Deux bornes à l'envers viennent d'une saisie, pas d'une intention : les
  // remettre dans l'ordre rend le résultat attendu là où un intervalle vide
  // aurait laissé croire qu'il n'y a aucun échange.
  //
  // La permutation porte sur les **chaînes**, avant lecture : une date seule
  // s'étend au jour entier, et son bord dépend du rôle qu'elle tient. Permuter
  // après coup donnerait un `to` calé sur un minuit — soit une journée entière
  // amputée à chaque saisie inversée. La comparaison se fait donc sur un bord
  // commun, seul moyen de comparer deux dates dont l'une n'a pas encore de rôle.
  let fromRaw = filters.from;
  let toRaw = filters.to;
  const fromProbe = parseHistoryDate(fromRaw, "start");
  const toProbe = parseHistoryDate(toRaw, "start");
  if (fromProbe && toProbe && fromProbe > toProbe) {
    [fromRaw, toRaw] = [toRaw, fromRaw];
  }

  const from = parseHistoryDate(fromRaw, "start");
  const to = parseHistoryDate(toRaw, "end");

  return {
    card: trimmedOrNull(filters.card, 200),
    partner: trimmedOrNull(filters.partner, 200),
    from,
    to,
    sort: filters.sort && isTradeHistorySort(filters.sort) ? filters.sort : DEFAULT_TRADE_HISTORY_SORT,
    page,
    limit,
    windowed: false,
    dropped: [],
  };
}

/** Ce qu'il faut d'un partenaire pour le reconnaître à son nom. */
export type PartnerIdentity = {
  username: string;
  displayName?: string | null;
  discriminator?: string | null;
};

/** Minuscules et accents ôtés : « Amélie » se cherche en tapant « amelie ». */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Vrai si ce partenaire répond au terme cherché — sur son pseudonyme, son nom
 * d'utilisateur ou son tag complet.
 *
 * Le rapprochement se fait **en mémoire, sur les partenaires de l'appelant**, et
 * non par une requête sur l'annuaire : filtrer son propre historique ne doit pas
 * pouvoir servir à savoir qui existe ailleurs sur la plateforme.
 */
export function partnerMatches(partner: PartnerIdentity, term: string): boolean {
  const needle = fold(term.trim());
  if (!needle) return true;

  const tag =
    partner.displayName && partner.discriminator
      ? `${partner.displayName}#${partner.discriminator}`
      : "";

  return [partner.username, partner.displayName ?? "", tag]
    .filter(Boolean)
    .some((candidate) => fold(candidate).includes(needle));
}

/**
 * Vrai si ces filtres demandent autre chose que l'historique par défaut.
 *
 * Sert à l'interface pour savoir s'il y a lieu de proposer « effacer les
 * filtres », et à l'API pour ne pas signaler un refus là où rien n'a été
 * demandé.
 */
export function hasActiveHistoryFilters(filters: TradeHistoryFilters): boolean {
  return Boolean(
    trimmedOrNull(filters.card, 200) ||
      trimmedOrNull(filters.partner, 200) ||
      trimmedOrNull(filters.from, 40) ||
      trimmedOrNull(filters.to, 40) ||
      (filters.sort && isTradeHistorySort(filters.sort) && filters.sort !== DEFAULT_TRADE_HISTORY_SORT)
  );
}
