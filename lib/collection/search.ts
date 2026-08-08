/**
 * Recherche de cartes dans la collection.
 *
 * Ce qu'un joueur tape dans la barre de recherche n'est pas toujours un nom
 * exact : c'est parfois un numéro de collection relevé sur la carte, ou un nom
 * saisi sans ses accents. Chercher `name` au caractère près laisse ces cas sans
 * résultat, ce qui donne l'impression que la recherche ne marche pas.
 */

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Lettres latines et leurs variantes accentuées. MongoDB n'applique pas la
 * collation aux expressions régulières : l'insensibilité aux accents se joue
 * donc dans le motif lui-même, `e` devenant `[eèéêë]`.
 */
const ACCENT_VARIANTS: Record<string, string> = {
  a: "aàáâãäå",
  c: "cç",
  e: "eèéêë",
  i: "iìíîï",
  n: "nñ",
  o: "oòóôõöø",
  u: "uùúûü",
  y: "yýÿ",
};

/** Motif qui ignore les accents, dans un sens comme dans l'autre. */
export function accentInsensitivePattern(query: string): string {
  // La saisie est d'abord dépouillée de ses accents : taper « é » doit trouver
  // « e » autant que l'inverse.
  const stripped = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  return [...stripped]
    .map((char) => {
      const variants = ACCENT_VARIANTS[char.toLowerCase()];
      return variants ? `[${variants}]` : escapeRegex(char);
    })
    .join("");
}

/**
 * Filtre Mongo pour un terme de recherche : le nom n'importe où, le numéro de
 * collection ou l'identifiant de carte en début de valeur.
 *
 * Le numéro et l'identifiant sont ancrés au début : chercher « 12 » doit
 * proposer la carte 12, pas les cent vingt cartes dont le numéro contient un
 * « 12 ». Renvoie `null` pour une recherche vide, l'appelant n'ayant alors rien
 * à ajouter à son filtre.
 */
export function cardSearchFilter(search: string | undefined): Record<string, unknown> | null {
  const trimmed = search?.trim();
  if (!trimmed) return null;

  const anywhere = accentInsensitivePattern(trimmed);
  // Le zéro de tête d'un numéro n'est pas toujours saisi : « 12 » doit trouver
  // « 012 » comme « 12 ».
  const prefix = `^0*${escapeRegex(trimmed)}`;

  const clauses: Record<string, unknown>[] = [
    { name: { $regex: anywhere, $options: "i" } },
    { collectorNumber: { $regex: prefix, $options: "i" } },
    { id: { $regex: `^${escapeRegex(trimmed)}`, $options: "i" } },
  ];

  // Une expression régulière ne s'applique qu'aux chaînes : les numéros de
  // collection stockés en nombre (le catalogue en contient des deux sortes,
  // d'où les `String(...)` à la lecture) demandent une égalité.
  //
  // Uniquement des chiffres : `Number` accepterait « 12e3 » ou « 1.0 » et
  // ajouterait une égalité sur un numéro que personne n'a cherché.
  if (/^\d+$/.test(trimmed)) {
    const asNumber = Number(trimmed);
    if (Number.isSafeInteger(asNumber)) {
      clauses.push({ collectorNumber: asNumber });
    }
  }

  return { $or: clauses };
}
