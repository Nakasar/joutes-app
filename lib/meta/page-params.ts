import { META_PERIOD_CHOICES, STAPLE_THRESHOLD_CHOICES, type ResolvedMetaSettings } from "@/lib/meta/settings";

/**
 * L'état de la page Méta d'un jeu, tel que l'adresse le porte : l'onglet, les
 * filtres, la carte étudiée. Tout est dans l'URL, pour qu'une vue se partage.
 * Les valeurs par défaut (celles du jeu) n'y figurent pas.
 */
export const META_TABS = ["overview", "cards", "staples", "together", "sets", "decks", "tournaments"] as const;
export type MetaTab = (typeof META_TABS)[number];

export type MetaPageState = {
  tab: MetaTab;
  /** 0 = tout l'échantillon. */
  periodDays: number;
  source?: string;
  legend?: string;
  domain?: string;
  /** Seuil des staples, de 0 à 1. */
  threshold: number;
  card?: string;
  type?: string;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/** Les périodes proposées : les choix habituels, plus celle du jeu si elle est autre. */
export function periodChoices(settings: ResolvedMetaSettings): number[] {
  return [...new Set<number>([...META_PERIOD_CHOICES, settings.defaultPeriodDays])].sort((a, b) =>
    a === 0 ? 1 : b === 0 ? -1 : a - b
  );
}

/** Un seuil en pourcentage, au dixième : 0,625 donne 62,5. */
export function thresholdPercent(threshold: number): number {
  return Math.round(threshold * 1000) / 10;
}

/** Les seuils proposés, en pourcentage : les choix habituels, plus celui du jeu. */
export function thresholdChoices(settings: ResolvedMetaSettings): number[] {
  return [...new Set<number>([...STAPLE_THRESHOLD_CHOICES, settings.stapleThreshold].map(thresholdPercent))].sort((a, b) => a - b);
}

export function parseMetaPageParams(raw: RawParams, settings: ResolvedMetaSettings): MetaPageState {
  const tab = first(raw.tab);
  const period = Number(first(raw.period));
  const threshold = Number(first(raw.seuil));
  // Le seuil du jeu garde sa valeur exacte, même affiché arrondi.
  const gameThreshold = thresholdPercent(settings.stapleThreshold);
  const page = Number(first(raw.page));

  return {
    tab: META_TABS.includes(tab as MetaTab) ? (tab as MetaTab) : "overview",
    periodDays: periodChoices(settings).includes(period) && first(raw.period) !== undefined ? period : settings.defaultPeriodDays,
    source: first(raw.source),
    legend: first(raw.legend),
    domain: first(raw.domain),
    threshold:
      thresholdChoices(settings).includes(threshold) && threshold !== gameThreshold ? threshold / 100 : settings.stapleThreshold,
    card: first(raw.card),
    type: first(raw.type),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/**
 * L'adresse d'un état de la page. Les valeurs par défaut sont omises ; changer
 * d'onglet ou de filtre ramène à la première page.
 */
export function metaHref(
  basePath: string,
  state: MetaPageState,
  settings: ResolvedMetaSettings,
  overrides: Partial<MetaPageState> = {}
): string {
  const next = { ...state, page: 1, ...overrides };
  const params = new URLSearchParams();
  if (next.tab !== "overview") params.set("tab", next.tab);
  if (next.periodDays !== settings.defaultPeriodDays) params.set("period", String(next.periodDays));
  if (next.source) params.set("source", next.source);
  if (next.legend) params.set("legend", next.legend);
  if (next.domain) params.set("domain", next.domain);
  if (thresholdPercent(next.threshold) !== thresholdPercent(settings.stapleThreshold)) {
    params.set("seuil", String(thresholdPercent(next.threshold)));
  }
  if (next.card) params.set("card", next.card);
  if (next.type) params.set("type", next.type);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
