/**
 * Garde-fou des imports de prix automatiques.
 *
 * Lancé à la main, un import montrait son bilan avant d'écrire : un
 * rapprochement effondré — Cardmarket qui renomme ses extensions, un feed
 * CardNexus tronqué — se voyait. Lancé par le cron, plus personne ne le lit.
 * L'import compare donc son résultat au dernier import écrit, et refuse
 * d'écrire quand le nombre de cartes cotées chute trop.
 *
 * La comparaison porte sur le nombre de cartes **cotées**, pas sur la part du
 * catalogue qu'elles représentent : l'ajout d'une extension que la place de
 * marché ne vend pas encore fait baisser la part sans rien casser, et
 * bloquerait l'import à chaque sortie.
 */

/** Chute tolérée d'un import au suivant : au-delà, rien n'est écrit. */
export const MAX_PRICED_DROP = 0.1;

export type ImportCoverage = {
  cards: number;
  matched: number;
  priced: number;
};

export type ImportGuardVerdict = { ok: true } | { ok: false; reason: string };

/**
 * `previous` est le dernier import **écrit** : un import refusé ne devient pas
 * la référence du suivant, sans quoi deux chutes successives passeraient.
 */
export function checkImportCoverage(
  current: ImportCoverage,
  previous: ImportCoverage | null,
  maxDrop: number = MAX_PRICED_DROP
): ImportGuardVerdict {
  if (current.priced === 0) {
    return { ok: false, reason: "aucune carte cotée" };
  }

  if (!previous || previous.priced === 0) {
    return { ok: true };
  }

  const floor = Math.ceil(previous.priced * (1 - maxDrop));

  if (current.priced < floor) {
    return {
      ok: false,
      reason:
        `${current.priced} cartes cotées contre ${previous.priced} au dernier import ` +
        `(chute de plus de ${Math.round(maxDrop * 100)} %)`,
    };
  }

  return { ok: true };
}
