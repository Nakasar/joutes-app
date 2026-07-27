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
