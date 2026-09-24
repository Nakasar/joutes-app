/**
 * Ce qu'un joueur reçoit des lieux qu'il suit.
 *
 * Trois niveaux, lieu par lieu :
 *
 *  - `all` — tout ce que le lieu envoie à ceux qui le suivent. C'est le niveau
 *    d'un lieu qu'on vient de suivre, et il **ne s'enregistre pas** : l'absence
 *    de réglage vaut `all`, si bien que les comptes qui suivaient déjà des
 *    lieux n'ont rien à migrer ;
 *  - `custom` — seulement les types cochés ;
 *  - `none` — rien, sans cesser de suivre le lieu (son agenda reste filtré,
 *    ses annonces restent sur sa page).
 *
 * Le réglage vit sur le compte, dans `lairNotificationPrefs`, une entrée par
 * lieu qui n'est pas en `all`. Il s'applique aux deux sens d'une notification
 * de lieu : la lecture (`notificationAccessStages`, qui résout l'audience au
 * moment où le joueur ouvre ses notifications) et l'envoi (push et MP Discord,
 * via `lib/db/notifications-audience.ts`). Les deux filtres s'écrivent ici,
 * côte à côte, pour ne pas pouvoir diverger.
 *
 * Seules les notifications adressées aux **abonnés** sont concernées : un
 * gérant reçoit celles de son lieu quoi qu'il ait réglé comme abonné.
 *
 * Module pur, testé dans `notification-prefs.test.ts`.
 */

/** Les types de notification qu'un lieu envoie à ceux qui le suivent. */
export const LAIR_NOTIFICATION_CATEGORIES = ["announcements", "live"] as const;
export type LairNotificationCategory = (typeof LAIR_NOTIFICATION_CATEGORIES)[number];

export const LAIR_NOTIFICATION_LEVELS = ["all", "custom", "none"] as const;
export type LairNotificationLevel = (typeof LAIR_NOTIFICATION_LEVELS)[number];

export type LairNotificationPreference =
  | { level: "all" }
  | { level: "none" }
  | { level: "custom"; categories: LairNotificationCategory[] };

/** Une entrée de `lairNotificationPrefs`. Jamais `all` : ce niveau ne s'écrit pas. */
export type StoredLairNotificationPref = {
  lairId: string;
  level: "custom" | "none";
  categories?: LairNotificationCategory[];
};

export const DEFAULT_LAIR_NOTIFICATION_PREFERENCE: LairNotificationPreference = { level: "all" };

export function isLairNotificationCategory(value: unknown): value is LairNotificationCategory {
  return typeof value === "string" && (LAIR_NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

/** Les catégories dans l'ordre de référence, sans doublon ni inconnue. */
function normalizeCategories(values: readonly unknown[]): LairNotificationCategory[] {
  return LAIR_NOTIFICATION_CATEGORIES.filter((category) => values.includes(category));
}

/**
 * Valide un réglage venu d'un formulaire ou d'une requête.
 *
 * Une catégorie inconnue est écartée plutôt que refusée : une app mobile plus
 * ancienne ou plus récente que le serveur ne doit pas voir tout son réglage
 * rejeté pour un type qu'elle seule connaît.
 */
export function parseLairNotificationPreference(input: unknown): LairNotificationPreference | null {
  if (!input || typeof input !== "object") return null;
  const { level, categories } = input as { level?: unknown; categories?: unknown };

  switch (level) {
    case "all":
      return { level: "all" };
    case "none":
      return { level: "none" };
    case "custom":
      if (!Array.isArray(categories)) return null;
      return { level: "custom", categories: normalizeCategories(categories) };
    default:
      return null;
  }
}

/** Le réglage d'un lieu, tel que le compte le porte. Absent : `all`. */
export function lairNotificationPreference(
  prefs: readonly StoredLairNotificationPref[] | undefined,
  lairId: string
): LairNotificationPreference {
  const stored = prefs?.find((pref) => pref.lairId === lairId);
  if (!stored) return DEFAULT_LAIR_NOTIFICATION_PREFERENCE;
  if (stored.level === "none") return { level: "none" };
  return { level: "custom", categories: normalizeCategories(stored.categories ?? []) };
}

/** Ce qui s'écrit pour un réglage : rien pour `all`. */
export function toStoredLairNotificationPref(
  lairId: string,
  preference: LairNotificationPreference
): StoredLairNotificationPref | null {
  switch (preference.level) {
    case "all":
      return null;
    case "none":
      return { lairId, level: "none" };
    case "custom":
      return { lairId, level: "custom", categories: normalizeCategories(preference.categories) };
  }
}

/**
 * Ce réglage laisse-t-il passer une notification de ce type ?
 *
 * Une notification sans type (antérieure aux réglages, ou émise sans en
 * préciser) ne passe qu'en `all` : en `custom`, le joueur a dit ce qu'il
 * voulait, et un envoi qui ne dit pas ce qu'il est n'en fait pas partie.
 */
export function acceptsLairNotification(
  preference: LairNotificationPreference,
  category: LairNotificationCategory | undefined
): boolean {
  switch (preference.level) {
    case "all":
      return true;
    case "none":
      return false;
    case "custom":
      return category !== undefined && preference.categories.includes(category);
  }
}

const FOLLOWER_TARGETS = ["followers", "all"];

/**
 * Les branches du `$or` d'autorisation pour les notifications d'abonnés.
 *
 * Les lieux en `all` tiennent dans une seule branche ; chaque lieu en `custom`
 * a la sienne, restreinte à ses catégories ; un lieu en `none` n'en a pas.
 */
export function followerNotificationBranches(
  followedLairIds: readonly string[],
  prefs: readonly StoredLairNotificationPref[] | undefined
): Record<string, unknown>[] {
  const everything: string[] = [];
  const branches: Record<string, unknown>[] = [];

  for (const lairId of followedLairIds) {
    const preference = lairNotificationPreference(prefs, lairId);
    if (preference.level === "all") {
      everything.push(lairId);
    } else if (preference.level === "custom" && preference.categories.length > 0) {
      branches.push({
        type: "lair",
        target: { $in: FOLLOWER_TARGETS },
        lairId,
        category: { $in: preference.categories },
      });
    }
  }

  if (everything.length > 0) {
    branches.unshift({ type: "lair", target: { $in: FOLLOWER_TARGETS }, lairId: { $in: everything } });
  }

  return branches;
}

/**
 * Le filtre des comptes à qui envoyer une notification d'abonnés, sur la
 * collection des comptes : ceux qui suivent le lieu, moins ceux dont le réglage
 * l'écarte. Le miroir exact de `acceptsLairNotification`.
 */
export function followerAudienceFilter(
  lairId: string,
  category: LairNotificationCategory | undefined
): Record<string, unknown> {
  const refusing = category
    ? { $or: [{ level: "none" }, { level: "custom", categories: { $ne: category } }] }
    : { level: { $in: ["none", "custom"] } };

  return {
    lairs: lairId,
    lairNotificationPrefs: { $not: { $elemMatch: { lairId, ...refusing } } },
  };
}
