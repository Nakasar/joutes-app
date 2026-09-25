import type { CardPrinting } from "@/lib/types/card";

/** Ce dont on a besoin d'une carte pour résoudre une variante d'impression. */
export type PrintableCard = {
  foil?: boolean;
  image?: string;
  printings?: CardPrinting[];
};

/**
 * Variante retenue pour un exemplaire (collection, booster, wishlist, liste de
 * vente). `printingId` absent = version de base de la carte.
 */
export type PrintingChoice = {
  printingId?: string;
  /** Libellé recopié sur l'exemplaire, pour l'afficher sans relire la carte. */
  printingName?: string;
  foil: boolean;
  image?: string;
};

/**
 * Résout la variante choisie. La version de base reprend l'illustration et le
 * caractère foil de la carte ; une variante imprimée en foil impose le foil, et
 * son illustration si elle en a une. Un identifiant inconnu (variante retirée
 * depuis) retombe sur la version de base plutôt que d'échouer.
 */
export function resolvePrinting(card: PrintableCard, printingId?: string): PrintingChoice {
  const printing = printingId ? card.printings?.find((item) => item.id === printingId) : undefined;

  if (!printing) {
    return { foil: card.foil === true, image: card.image };
  }

  return {
    printingId: printing.id,
    printingName: printing.name,
    foil: printing.foil === true || card.foil === true,
    image: printing.image || card.image,
  };
}

/**
 * Le choix du foil est verrouillé lorsque la carte n'existe qu'en foil ou que
 * la variante retenue est imprimée en foil.
 */
export function isFoilForced(card: PrintableCard, printingId?: string): boolean {
  return resolvePrinting(card, printingId).foil;
}

/** Exemplaire dont on change la variante : ce qu'il porte aujourd'hui. */
export type PrintedCopy = {
  printingId?: string;
  foil?: boolean;
};

/**
 * Nouvelle variante d'un exemplaire déjà saisi (changement en masse sur un
 * booster). Renvoie `null` quand la carte n'existe pas dans la variante
 * demandée : l'exemplaire reste alors tel quel.
 *
 * Le foil choisi à la main est conservé, sauf s'il ne tenait qu'à l'ancienne
 * variante (une variante foil quittée pour la version de base redevient non
 * foil) ; une variante imprimée en foil l'impose toujours.
 */
export function changePrinting(card: PrintableCard, copy: PrintedCopy, printingId?: string): PrintingChoice | null {
  const next = resolvePrinting(card, printingId);
  if (printingId && next.printingId !== printingId) {
    return null;
  }

  const previousForced = resolvePrinting(card, copy.printingId).foil;
  const keptFoil = copy.foil === true && !previousForced;

  return { ...next, foil: next.foil || keptFoil };
}
