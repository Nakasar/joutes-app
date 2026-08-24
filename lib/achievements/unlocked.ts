import type { AchievementWithUnlockInfo } from "@/lib/types/Achievement";

/**
 * Les succès décrochés, du plus récent au plus ancien.
 *
 * La vitrine d'un profil n'en montre que les premiers, et « les trois
 * derniers » est la seule sélection de trois qui veuille dire quelque chose —
 * l'ordre du catalogue, lui, n'en dit aucune.
 *
 * Module pur : `lib/db/achievements.ts` ouvre une connexion au chargement, et
 * cette règle-là se vérifie sans base.
 */

/**
 * La date de déblocage en millisecondes, `0` quand elle manque ou ne se lit
 * pas.
 *
 * `unlockedAt` est typé `Date`, mais il vient de Mongo : un document écrit par
 * un script d'import peut le porter en chaîne, et une chaîne illisible donne
 * `NaN`. Or `NaN` dans un comparateur ne trie pas — il rend l'ordre de
 * `sort` indéfini pour **toute** la liste, pas seulement pour l'élément fautif.
 * D'où le repli à `0`, qui range la date illisible en fin de liste et laisse le
 * reste trié.
 */
function unlockedTime(achievement: { unlockedAt?: Date }): number {
  if (!achievement.unlockedAt) {
    return 0;
  }

  const time = new Date(achievement.unlockedAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Les succès que ce compte détient, du plus récemment décroché au plus ancien. */
export function unlockedMostRecentFirst<T extends AchievementWithUnlockInfo>(
  achievements: readonly T[],
): T[] {
  return achievements
    .filter((achievement) => achievement.unlockedAt)
    .sort((a, b) => unlockedTime(b) - unlockedTime(a));
}
