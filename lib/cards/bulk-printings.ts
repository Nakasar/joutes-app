import { buildPrintingId } from "@/lib/constants/card-ids";
import { MAX_CARD_PRINTINGS } from "@/lib/schemas/card.schema";
import type { CardPrinting } from "@/lib/types/card";

/**
 * Ajout d'une même variante d'impression à toute une liste de cartes. La
 * décision est prise carte par carte et sans toucher à la base : c'est ce qui
 * la rend vérifiable, et le point délicat — ne pas casser les identifiants de
 * variantes existants — se lit ici.
 */

/** Variante saisie une fois, appliquée à toutes les cartes de la liste. */
export type BulkPrinting = {
  name: string;
  foil?: boolean;
  image?: string;
};

export type PrintingPlan =
  /** La variante n'existait pas : elle est ajoutée à la suite. */
  | { action: "add"; printings: CardPrinting[] }
  /** Elle existait et l'appelant a demandé à l'écraser. */
  | { action: "replace"; printings: CardPrinting[] }
  /** Elle existait déjà : la carte est laissée telle quelle. */
  | { action: "skip" }
  /** La carte porte déjà autant de variantes que le formulaire en accepte. */
  | { action: "limit" };

/**
 * Découpe une saisie libre en identifiants de cartes : un par ligne, séparés
 * par des virgules ou des espaces — un copier-coller de tableur comme de liste
 * doit marcher. Les doublons sont retirés en gardant l'ordre saisi.
 *
 * La casse n'est **pas** normalisée : un identifiant mêle un code d'extension
 * en majuscules et un numéro de collection qui peut porter des lettres
 * (`SOR-001a`). Mettre le tout en majuscules inventerait des identifiants qui
 * n'existent pas ; mieux vaut signaler ceux qui n'ont pas été trouvés.
 */
export function parseCardIdList(raw: string): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const token of raw.split(/[\s,;]+/)) {
    const id = token.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

/** Le corps de la variante, sans les champs vides qui encombreraient le document. */
function printingBody(printing: BulkPrinting): Omit<CardPrinting, "id"> {
  return {
    name: printing.name.trim(),
    ...(printing.foil ? { foil: true } : {}),
    ...(printing.image ? { image: printing.image } : {}),
  };
}

/**
 * Ce qu'il faut écrire — ou ne pas écrire — sur une carte donnée.
 *
 * Une variante est reconnue comme « déjà là » par son identifiant dérivé ou par
 * son nom : c'est ce qui rend l'opération rejouable après une faute de frappe
 * sur l'image, sans empiler deux fois la même variante.
 */
export function planPrintingAddition(
  existing: CardPrinting[] | undefined,
  printing: BulkPrinting,
  { replaceExisting }: { replaceExisting: boolean }
): PrintingPlan {
  const current = existing ?? [];
  const name = printing.name.trim();
  const desiredId = buildPrintingId(name);
  const body = printingBody(printing);

  // Par identifiant ou par nom : une variante renommée garde son identifiant
  // (les exemplaires de collection s'y réfèrent), donc les deux voies désignent
  // la même variante et aucune ne suffit seule.
  const matchIndex = current.findIndex(
    (item) => item.id === desiredId || item.name?.trim().toLowerCase() === name.toLowerCase()
  );

  if (matchIndex >= 0) {
    if (!replaceExisting) {
      return { action: "skip" };
    }

    const next = [...current];
    // L'identifiant de la variante existante est conservé : les exemplaires de
    // collection et les wishlists s'y réfèrent par `printingId`. Le régénérer
    // depuis le nom détacherait ces exemplaires de leur variante.
    next[matchIndex] = { ...body, id: current[matchIndex].id?.trim() || desiredId };
    return { action: "replace", printings: next };
  }

  if (current.length >= MAX_CARD_PRINTINGS) {
    return { action: "limit" };
  }

  // Aucune variante ne porte `desiredId` — le test ci-dessus l'aurait attrapée —
  // donc il est libre : pas de suffixe à chercher.
  return { action: "add", printings: [...current, { ...body, id: desiredId }] };
}
