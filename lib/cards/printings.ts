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

/** Ce qu'il faut d'une variante pour la ranger dans son édition. */
type EditionPrinting = {
  id: string;
  name: string;
  setCode?: string;
  collectorNumber?: string;
};

/** Numéro de collection écrit en fin de nom : `Welcome to Night City — Beta (β008)`. */
const TRAILING_NUMBER = /\s*\(([^()]*\d[^()]*)\)\s*$/;

/**
 * Édition d'une variante : ce que plusieurs cartes ont en commun quand elles
 * ont été tirées ensemble, là où l'identifiant de la variante est propre à sa
 * carte. Chez Cyberpunk, la variante Beta de Chrome Fang et celle de Reboot
 * Optics ont chacune leur identifiant et leur numéro (`β008`, `β136`), mais la
 * même édition, « Welcome to Night City — Beta ».
 *
 * L'extension propre à la variante la désigne quand elle est connue ; à défaut,
 * son nom privé du numéro qui le termine. Le libellé est ce nom-là.
 */
export function printingEdition(printing: { name: string; setCode?: string }): { key: string; name: string } {
  const name = printing.name.replace(TRAILING_NUMBER, "").trim() || printing.name;
  const key = printing.setCode ? `set:${printing.setCode.toLowerCase()}` : `name:${name.toLowerCase()}`;

  return { key, name };
}

/** Un numéro réduit à ses lettres latines et chiffres : `β008` et `008` se rejoignent. */
const bareNumber = (number?: string) => (number ?? "").toLowerCase().replace(/[^0-9a-z]/g, "");

/**
 * La variante d'une carte dans une édition, ou `undefined` si la carte n'y a
 * pas été tirée.
 *
 * Une carte a parfois deux tirages dans une même édition — deux illustrations
 * d'une même carte Beta. Celui qui porte le numéro de la carte l'emporte
 * (`β005a` pour la carte `005a`, plutôt que `β005b`) ; à défaut, le premier.
 */
export function editionPrinting<T extends EditionPrinting>(
  card: { collectorNumber?: string; printings?: T[] },
  editionKey: string
): T | undefined {
  const candidates = (card.printings ?? []).filter((printing) => printingEdition(printing).key === editionKey);

  if (candidates.length <= 1) {
    return candidates[0];
  }

  const number = bareNumber(card.collectorNumber);
  const sameNumber = candidates.find(
    (printing) => bareNumber(printing.collectorNumber ?? TRAILING_NUMBER.exec(printing.name)?.[1]) === number
  );

  return sameNumber ?? candidates[0];
}
