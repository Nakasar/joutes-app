/**
 * Réglages des statistiques de la méta, par jeu.
 *
 * Écrits sur la fiche du jeu (`Game.metaSettings`) depuis l'écran de gestion
 * des decks méta ; un jeu qui n'en a pas suit les valeurs par défaut. Le type
 * enregistré est partiel : une valeur absente reprend la valeur par défaut,
 * ce qui laisse changer celle-ci sans migrer les jeux déjà réglés.
 */
export type GameMetaSettings = {
  /** Part minimale des decks d'un domaine qui jouent la carte pour qu'elle soit une staple (0 à 1). */
  stapleThreshold?: number;
  /** Un domaine joué par moins de decks que cela n'a pas de staples : l'échantillon serait trop petit. */
  minDecksPerDomain?: number;
  /** Période affichée par défaut sur la page Méta, en jours. */
  defaultPeriodDays?: number;
  /**
   * La sortie de chaque extension, `AAAA-MM-JJ` par code d'extension : les
   * winrates se comptent par défaut depuis la dernière sortie.
   */
  setReleases?: Record<string, string>;
};

export type ResolvedMetaSettings = Required<GameMetaSettings>;

export const DEFAULT_META_SETTINGS: ResolvedMetaSettings = {
  stapleThreshold: 0.75,
  minDecksPerDomain: 20,
  defaultPeriodDays: 30,
  setReleases: {},
};

const SET_CODE = /^[A-Za-z0-9-]{1,12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Les dates de sortie valides : un code d'extension, un jour qui existe. */
export function cleanSetReleases(releases: unknown): Record<string, string> {
  if (!releases || typeof releases !== "object") return {};
  return Object.fromEntries(
    Object.entries(releases as Record<string, unknown>).filter(
      (entry): entry is [string, string] =>
        SET_CODE.test(entry[0]) &&
        typeof entry[1] === "string" &&
        DAY.test(entry[1]) &&
        !Number.isNaN(new Date(`${entry[1]}T00:00:00Z`).getTime()) &&
        new Date(`${entry[1]}T00:00:00Z`).toISOString().startsWith(entry[1])
    )
  );
}

/** Les seuils proposés aux visiteurs à côté de celui du jeu. */
export const STAPLE_THRESHOLD_CHOICES = [0.6, 0.75, 0.9] as const;

/** Les périodes proposées, en jours ; 0 = tout l'échantillon. */
export const META_PERIOD_CHOICES = [7, 30, 90, 0] as const;

/** Complète les réglages d'un jeu avec les valeurs par défaut, et ramène chaque valeur dans ses bornes. */
export function resolveMetaSettings(settings?: GameMetaSettings | null): ResolvedMetaSettings {
  const threshold = settings?.stapleThreshold;
  const minDecks = settings?.minDecksPerDomain;
  const period = settings?.defaultPeriodDays;

  return {
    stapleThreshold:
      typeof threshold === "number" && threshold > 0 && threshold <= 1
        ? threshold
        : DEFAULT_META_SETTINGS.stapleThreshold,
    minDecksPerDomain:
      typeof minDecks === "number" && Number.isInteger(minDecks) && minDecks >= 1
        ? minDecks
        : DEFAULT_META_SETTINGS.minDecksPerDomain,
    defaultPeriodDays:
      typeof period === "number" && Number.isInteger(period) && period >= 0
        ? period
        : DEFAULT_META_SETTINGS.defaultPeriodDays,
    setReleases: cleanSetReleases(settings?.setReleases),
  };
}
