export type CardSearchQuery = {
  setCode: string | null;
  cn: string | null;
  lang: string | null;
  text: string;
};

/**
 * Filtres écrits dans la barre de recherche : `e:XXX` / `set:XXX` pour
 * l'extension, `cn:000a` pour le numéro de collection, `lang:fr` pour la
 * langue. Partagé par les éditeurs de booster et de paquet de cube, pour que
 * la même saisie donne le même résultat dans les deux.
 */
export function parseCardSearch(raw: string): CardSearchQuery {
  let text = ` ${raw} `;
  let setCode: string | null = null;
  let cn: string | null = null;
  let lang: string | null = null;

  const e = text.match(/(?:^|\s)(?:e|set):([\w*]+)/i);
  if (e) {
    setCode = e[1].toUpperCase();
    text = text.replace(e[0], " ");
  }

  const c = text.match(/(?:^|\s)cn:([\w*]+)/i);
  if (c) {
    cn = c[1];
    text = text.replace(c[0], " ");
  }

  const l = text.match(/(?:^|\s)lang:([\w*]+)/i);
  if (l) {
    lang = l[1];
    text = text.replace(l[0], " ");
  }

  const trimmed = text.trim();
  // Un nombre seul vaut pour un numéro de collection.
  if (!cn && /^\d+$/.test(trimmed)) {
    return { setCode, cn: trimmed, lang, text: "" };
  }

  return { setCode, cn, lang, text: trimmed };
}

/**
 * Texte cherché envoyé par les éditeurs de booster et de paquet de cube. Tout
 * part tel quel — l'API lit elle-même les tokens de la barre (`domain:fury`,
 * `energy<=3`) — sauf un nombre seul, qui désigne depuis toujours un numéro de
 * collection dans ces écrans et doit continuer à le faire.
 *
 * La saisie est rognée : une barre où il ne reste que des espaces n'a rien à
 * chercher, et l'appelant ne pose le paramètre que si le texte n'est pas vide.
 */
export function cardSearchText(raw: string): string {
  const trimmed = raw.trim();
  return /^\d+$/.test(trimmed) ? `cn:${trimmed}` : trimmed;
}

/**
 * Un numéro de collection tapé seul — `12`, `202a`, `12*` — que l'API traite
 * comme `cn:` à la manière des éditeurs de booster, même quand il suit des
 * filtres (`set:UNL 12`). Au-delà de quatre chiffres, c'est plutôt un nom ou
 * un texte de carte qu'un numéro.
 */
export function bareCollectorNumber(text: string): string | null {
  const trimmed = text.trim();
  return /^\d{1,4}[a-z]?\*?$/i.test(trimmed) ? trimmed : null;
}

/**
 * Les écritures possibles d'un numéro de collection. Les catalogues ne
 * s'accordent pas sur les zéros de tête — Riftbound écrit `012`, d'autres
 * jeux `12` — et celui qui tape le numéro lu sur la carte ne devrait pas
 * avoir à le savoir : `12` trouve `12`, `012` et `0012`, `012a` trouve `12a`.
 * Ce qui ne commence pas par un chiffre est rendu tel quel.
 */
export function collectorNumberVariants(cn: string): string[] {
  const match = cn.match(/^(\d+)(.*)$/);
  if (!match) return [cn];
  const digits = match[1].replace(/^0+(?=\d)/, "");
  const suffix = match[2];
  const variants = new Set<string>([cn]);
  for (let width = digits.length; width <= 4; width += 1) {
    variants.add(`${digits.padStart(width, "0")}${suffix}`);
  }
  return [...variants];
}
