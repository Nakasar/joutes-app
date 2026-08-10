/**
 * Listes d'armée d'un rapport de bataille : normalisation et bornes.
 *
 * Une liste d'armée n'est pas un contenu de produit (`lib/products/contents.ts`) :
 * elle décrit ce qu'un joueur a **posé sur la table**, pas ce qu'une boîte
 * contient. Deux différences en découlent, et ce sont elles qui justifient un
 * module à part :
 *
 *  - **une ligne peut ne désigner aucun produit du catalogue.** L'autocomplétion
 *    propose les figurines du jeu, mais un catalogue est toujours en retard sur
 *    la dernière sortie, et une figurine convertie ou proxifiée n'y figurera
 *    jamais. Refuser la saisie libre reviendrait à refuser le rapport.
 *  - **le nom est écrit dans le rapport**, et non retrouvé par jointure à
 *    l'affichage. C'est déjà la convention des exemplaires de collection
 *    (`CollectionProductDb`) : un rapport de bataille est une archive, il doit
 *    rester lisible après le retrait d'un produit du catalogue.
 *
 * Module pur, sans accès à la base : c'est ce qui le rend testable.
 */

import type { BattleReport, BattleReportArmy, BattleReportArmyUnit } from "@/lib/types/Match";

/** Au-delà, ce n'est plus une liste d'armée mais un collage — la saisie est tronquée. */
export const MAX_ARMY_UNITS = 60;

/** Même plafond que la quantité d'une ligne de contenu de produit. */
export const MAX_UNIT_QUANTITY = 99;

export const MAX_UNIT_NAME_LENGTH = 120;
export const MAX_ARMY_NAME_LENGTH = 120;
export const MAX_SCENARIO_LENGTH = 200;
export const MAX_NOTES_LENGTH = 10_000;

/**
 * Deux lignes désignent la même figurine si elles citent le même produit ; à
 * défaut de produit, si elles portent le même nom, à la casse et aux espaces
 * près. Sans cette seconde clé, taper deux fois « Clone Trooper » laisserait
 * deux lignes identiques dans le rapport.
 */
function unitKey(productId: string | undefined, name: string): string {
  return productId ? `product:${productId}` : `name:${name.toLocaleLowerCase()}`;
}

/**
 * Fusionne les doublons en additionnant leurs quantités, et ramène tout dans
 * les bornes. Poser deux fois la même figurine est une maladresse courante — et
 * parfois une intention (deux escouades identiques) : dans les deux cas, une
 * ligne de quantité 2 dit la même chose que deux lignes de quantité 1.
 *
 * L'ordre de première apparition est conservé : une liste d'armée se lit dans
 * l'ordre où son auteur l'a écrite.
 */
export function normalizeArmyUnits(units: BattleReportArmyUnit[]): BattleReportArmyUnit[] {
  const merged = new Map<string, BattleReportArmyUnit>();

  for (const unit of units) {
    const name = unit.name.trim().slice(0, MAX_UNIT_NAME_LENGTH);
    if (!name) continue;

    const productId = unit.productId?.trim() || undefined;
    const quantity = Math.min(
      MAX_UNIT_QUANTITY,
      Math.max(1, Math.trunc(Number.isFinite(unit.quantity) ? unit.quantity : 1))
    );

    const existing = merged.get(unitKey(productId, name));

    if (existing) {
      existing.quantity = Math.min(MAX_UNIT_QUANTITY, existing.quantity + quantity);
      continue;
    }

    // La liste pleine ne prend plus de nouvelle figurine, mais les lignes
    // suivantes peuvent encore rejoindre celles déjà retenues : sortir de la
    // boucle ici perdrait leur quantité.
    if (merged.size >= MAX_ARMY_UNITS) continue;

    merged.set(unitKey(productId, name), { ...(productId ? { productId } : {}), name, quantity });
  }

  return [...merged.values()];
}

/**
 * Nettoie une liste d'armée. Le nom vide disparaît du document plutôt que d'y
 * rester en chaîne vide — c'est la convention du dépôt pour les champs
 * facultatifs, et l'affichage lit ces champs par vérité.
 */
export function normalizeArmy(army: BattleReportArmy): BattleReportArmy {
  const name = army.name?.trim().slice(0, MAX_ARMY_NAME_LENGTH);

  return {
    ...(name ? { name } : {}),
    units: normalizeArmyUnits(army.units ?? []),
  };
}

/**
 * Une liste sans nom ni figurine ne dit rien : la retirer du rapport vaut mieux
 * que d'y laisser un objet vide, qui afficherait une section « armée » creuse
 * sous le nom du joueur.
 */
export function isEmptyArmy(army: BattleReportArmy): boolean {
  return !army.name?.trim() && army.units.length === 0;
}

/** Nombre de figurines posées sur la table, doublons compris. */
export function countArmyUnits(army: BattleReportArmy): number {
  return army.units.reduce((total, unit) => total + unit.quantity, 0);
}

/**
 * Nettoie un rapport entier avant écriture : scénario et notes bornés, listes
 * d'armée normalisées, listes vides écartées.
 *
 * `playerIds` est la liste des joueurs de la partie. Une armée dont la clé n'y
 * figure pas est abandonnée : un joueur retiré de la partie ne doit pas laisser
 * derrière lui une liste d'armée que plus aucun nom n'accompagne à l'affichage.
 */
export function normalizeBattleReport(report: BattleReport, playerIds: string[]): BattleReport {
  const scenario = report.scenario?.trim().slice(0, MAX_SCENARIO_LENGTH);
  const notes = report.notes?.trim().slice(0, MAX_NOTES_LENGTH);
  const known = new Set(playerIds);

  const armies = Object.entries(report.armies ?? {})
    .filter(([playerId]) => known.has(playerId))
    .map(([playerId, army]) => [playerId, normalizeArmy(army)] as const)
    .filter(([, army]) => !isEmptyArmy(army));

  return {
    ...(scenario ? { scenario } : {}),
    ...(notes ? { notes } : {}),
    ...(armies.length > 0 ? { armies: Object.fromEntries(armies) } : {}),
  };
}
