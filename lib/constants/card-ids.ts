/**
 * Identifiant d'une carte : il est dérivé du code d'extension et du numéro de
 * collection, avec une convention par jeu (Riftbound colle les deux — `SFD125`
 * — quand Star Wars Unlimited les sépare d'un tiret — `SOR-001`), reprise des
 * scripts d'import de chaque jeu.
 *
 * Les jeux absents de la table suivent la concaténation simple ; l'identifiant
 * reste modifiable à la main dans le formulaire d'administration pour les cas
 * qui ne rentrent dans aucune des deux conventions.
 */
const CARD_ID_SEPARATOR_BY_GAME: Record<string, string> = {
  swu: "-",
  // Sorcery n'imprime pas de numéro de collection : le sien est le slug de la
  // carte (`GOT-abaddon-succubus`), que le tiret sépare du code d'extension.
  sorcery: "-",
  // Cyberpunk numérote ses cartes `005a`, `012b` : collés au code d'extension,
  // `WNC005a` se lirait mal, et `WNCB005a` ne dirait plus où finit l'extension.
  cp: "-",
};

export function cardIdSeparator(gameSlug?: string): string {
  return CARD_ID_SEPARATOR_BY_GAME[gameSlug ?? ""] ?? "";
}

export function buildCardId(gameSlug: string | undefined, setCode: string, collectorNumber: string): string {
  const set = setCode.trim().toUpperCase();
  const number = collectorNumber.trim();
  if (!set || !number) {
    return "";
  }
  return `${set}${cardIdSeparator(gameSlug)}${number}`;
}

/**
 * Fragment d'identifiant dérivé d'un texte libre (« Promo Pack Nexus » ->
 * `promo-pack-nexus`) : accents retirés, minuscules, tout le reste réduit à des
 * tirets. Partagé par les variantes d'impression et les produits, pour que deux
 * saisies identiques donnent partout le même identifiant.
 *
 * Renvoie la chaîne vide si le texte ne contient rien d'exploitable ; le repli
 * est laissé à l'appelant, qui seul sait ce qu'il nomme.
 */
export function slugSegment(value: string, maxLength = 60): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

/**
 * Identifiant d'une variante d'impression, dérivé de son nom (« Promo Pack
 * Nexus » -> `promo-pack-nexus`). Il n'a de sens qu'au sein d'une carte, et
 * reste stable si la variante est renommée : il n'est calculé qu'à la création
 * de la variante.
 */
export function buildPrintingId(name: string): string {
  return slugSegment(name) || "variante";
}

/**
 * Complète les identifiants manquants et lève les collisions, pour que deux
 * variantes d'une même carte ne partagent jamais le même identifiant.
 */
export function withUniquePrintingIds<T extends { id?: string; name: string }>(
  printings: T[]
): (T & { id: string })[] {
  const used = new Set<string>();

  return printings.map((printing) => {
    const base = printing.id?.trim() || buildPrintingId(printing.name);
    let id = base;
    for (let suffix = 2; used.has(id); suffix++) {
      id = `${base}-${suffix}`;
    }
    used.add(id);

    return { ...printing, id };
  });
}
