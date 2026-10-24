/**
 * Traductions des cartes, saisies depuis l'administration (`/admin/translations`).
 *
 * Aucune base ne publie les cartes de la plupart des jeux en français : la
 * traduction est donc rattachée à la carte du catalogue (`translations.<lang>`)
 * plutôt que d'en faire une carte distincte. Collection, decks, prix, errata
 * et listes de souhaits continuent de pointer vers le même identifiant, et la
 * langue d'un exemplaire reste portée par l'exemplaire.
 *
 * Seuls le nom et le texte se traduisent carte par carte. Le vocabulaire
 * (types, domaines, étiquettes, raretés, mots-clés) se traduit une fois pour
 * tout le jeu, dans son glossaire (cf. `CardGlossary`).
 *
 * Ce module ne dépend ni de la base ni du serveur : la fiche, l'écran de saisie
 * et les tests le partagent.
 */

/** `draft` : saisie entamée, pas encore montrée aux joueurs. `done` : publiée. */
export type CardTranslationStatus = "draft" | "done";

export type CardTranslation = {
  name?: string;
  text?: string;
  status: CardTranslationStatus;
  /**
   * Le nom et le texte de la carte au moment de la traduction. Un import qui
   * les change fait repasser la traduction « à revoir », et l'écran de saisie
   * montre ce qui a bougé.
   */
  source: { name: string; text?: string };
  updatedAt: string;
  updatedBy?: string;
};

export type CardTranslations = Partial<Record<string, CardTranslation>>;

/** Où en est la traduction d'une carte dans une langue. */
export type CardTranslationState = "todo" | "draft" | "stale" | "done";

export const CARD_TRANSLATION_STATES: readonly CardTranslationState[] = ["todo", "stale", "draft", "done"];

export function cardTranslationState(
  card: { name: string; text?: string },
  translation: Pick<CardTranslation, "status" | "source"> | undefined
): CardTranslationState {
  if (!translation) {
    return "todo";
  }
  if (translation.status === "draft") {
    return "draft";
  }
  return isTranslationSourceCurrent(card, translation.source) ? "done" : "stale";
}

export function isTranslationSourceCurrent(
  card: { name: string; text?: string },
  source: { name: string; text?: string } | undefined
): boolean {
  return Boolean(source) && source!.name === card.name && (source!.text ?? "") === (card.text ?? "");
}

/**
 * Le nom et le texte à montrer dans une langue, si la carte y est traduite.
 * Un brouillon ne se montre pas ; une traduction « à revoir » si : le texte
 * anglais a bougé, mais la traduction reste bien plus utile que rien.
 */
export function publishedTranslation(
  translations: CardTranslations | undefined,
  lang: string
): { name?: string; text?: string } | undefined {
  const translation = translations?.[lang];
  if (!translation || translation.status !== "done") {
    return undefined;
  }
  if (!translation.name && !translation.text) {
    return undefined;
  }
  return { name: translation.name || undefined, text: translation.text || undefined };
}

/**
 * Relit `translations` tel qu'il est en base, sans faire confiance à sa forme :
 * une entrée qui n'a ni statut ni source est ignorée.
 */
export function readCardTranslations(value: unknown): CardTranslations | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const result: CardTranslations = {};
  for (const [lang, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const status = entry.status === "draft" || entry.status === "done" ? entry.status : undefined;
    const source = entry.source as Record<string, unknown> | undefined;
    if (!status || !source || typeof source.name !== "string") continue;

    const updatedAt = entry.updatedAt instanceof Date
      ? entry.updatedAt.toISOString()
      : typeof entry.updatedAt === "string" ? entry.updatedAt : new Date(0).toISOString();

    result[lang] = {
      name: typeof entry.name === "string" && entry.name ? entry.name : undefined,
      text: typeof entry.text === "string" && entry.text ? entry.text : undefined,
      status,
      source: { name: source.name, text: typeof source.text === "string" ? source.text : undefined },
      updatedAt,
      updatedBy: typeof entry.updatedBy === "string" ? entry.updatedBy : undefined,
    };
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Ce que l'index de recherche garde des traductions : le nom et le texte de
 * chaque langue publiée, de quoi trouver « Rebelle » ou lire un nom français
 * au scanner. Le reste (source, auteur) ne sert qu'à l'administration.
 */
export function searchableTranslations(
  translations: CardTranslations | undefined
): Record<string, { name?: string; text?: string }> | undefined {
  if (!translations) return undefined;

  const result: Record<string, { name?: string; text?: string }> = {};
  for (const lang of Object.keys(translations)) {
    const published = publishedTranslation(translations, lang);
    if (published) result[lang] = published;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

// --- Glossaire ---------------------------------------------------------------

/** La catégorie des mots-clés : les autres sont des attributs de carte (`type`, `domain`…). */
export const KEYWORD_GLOSSARY_FIELD = "keyword";

export type CardGlossaryEntry = {
  /** `keyword`, ou la clé de l'attribut traduit (`type`, `tags`, `domain`…). */
  field: string;
  /** Le terme tel qu'il est écrit sur la carte anglaise. */
  en: string;
  /** Sa traduction. Vide : le terme reste tel quel (noms propres). */
  value: string;
  /** Mots-clés seulement : le texte de rappel traduit, sans ses parenthèses. */
  reminder?: string;
};

/** Accès rapide au glossaire d'un jeu dans une langue : `field` puis terme anglais. */
export type GlossaryLookup = Map<string, Map<string, CardGlossaryEntry>>;

export function glossaryLookup(entries: readonly CardGlossaryEntry[]): GlossaryLookup {
  const lookup: GlossaryLookup = new Map();
  for (const entry of entries) {
    if (!lookup.has(entry.field)) lookup.set(entry.field, new Map());
    lookup.get(entry.field)!.set(entry.en, entry);
  }
  return lookup;
}

/**
 * Un terme d'attribut traduit, ou le terme d'origine s'il n'est pas (encore)
 * au glossaire.
 *
 * Un terme absent de sa catégorie est cherché dans les autres : un jeu range
 * souvent le même mot sous plusieurs attributs (`type` et `types` chez
 * Riftbound), qu'on ne veut pas faire traduire deux fois. Les mots-clés n'y
 * entrent pas, ce sont des noms de capacités.
 */
export function translateTerm(lookup: GlossaryLookup, field: string, value: string): string {
  const own = lookup.get(field)?.get(value);
  if (own) {
    return own.value || value;
  }
  for (const [otherField, terms] of lookup) {
    if (otherField === KEYWORD_GLOSSARY_FIELD) continue;
    const entry = terms.get(value);
    if (entry?.value) return entry.value;
  }
  return value;
}

/** La valeur d'un attribut traduite, terme à terme pour une liste. */
export function translateAttributeValue(lookup: GlossaryLookup, field: string, value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? translateTerm(lookup, field, item) : item));
  }
  return typeof value === "string" ? translateTerm(lookup, field, value) : value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Le texte anglais d'une carte, mots-clés traduits : le point de départ de la
 * saisie.
 *
 * `[Reaction] (Play any time…)` devient `[Réaction] (Jouable à tout moment…)`
 * quand le glossaire connaît le mot-clé et son rappel ; le rappel anglais reste
 * en place sinon. Les valeurs (`[Assault 2]`) et les symboles (`:rb_might:`)
 * sont conservés. Les phrases propres à la carte restent en anglais, à
 * réécrire : les laisser en place évite de reperdre l'emplacement des
 * symboles.
 */
export function prefillTranslatedText(
  text: string | undefined,
  entries: readonly CardGlossaryEntry[]
): { text: string; keywords: number } {
  if (!text) {
    return { text: "", keywords: 0 };
  }

  const keywords = entries.filter((entry) => entry.field === KEYWORD_GLOSSARY_FIELD && entry.value);
  if (keywords.length === 0) {
    return { text, keywords: 0 };
  }

  const byName = new Map(keywords.map((entry) => [entry.en, entry]));
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  // Le nom, une valeur éventuelle (chiffres, symboles, un niveau de crochets
  // comme dans `[Equip [1]:rb_rune_body:]`), puis le rappel qui suit
  // immédiatement le mot-clé, éventuellement après un point (`[Predict]. (…)`).
  const pattern = new RegExp(
    `\\[(${names.join("|")})((?:[^\\[\\]]|\\[[^\\]]*\\])*)\\](\\.?)(\\s*\\(([^()]*)\\))?`,
    "g"
  );

  let count = 0;
  const result = text.replace(pattern, (_full, name: string, value: string, dot: string, reminderBlock?: string) => {
    const entry = byName.get(name)!;
    count += 1;
    const translatedReminder = reminderBlock
      ? entry.reminder
        ? `${reminderBlock.match(/^\s*/)![0]}(${entry.reminder})`
        : reminderBlock
      : "";
    return `[${entry.value}${value}]${dot}${translatedReminder}`;
  });

  return { text: result, keywords: count };
}

/**
 * Les mots-clés écrits entre crochets dans un texte de carte : `[Reaction]`,
 * `[Assault 2]` → `Reaction`, `Assault`. Sert à proposer au glossaire les
 * mots-clés de jeux qui n'ont pas de règles importées.
 */
export function bracketedKeywords(text: string | undefined): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const match of text.matchAll(/\[([A-Za-z][A-Za-z' -]*?)(?:\s+(?:\d+|\[[^\]]*\]|:[a-z0-9_]+:)[^\]]*)?\]/g)) {
    const name = match[1].trim();
    // `[>]` et autres marqueurs ne commencent pas par une lettre ; un nom de
    // plus de quatre mots est une carte citée, pas un mot-clé.
    if (name && name.split(/\s+/).length <= 4) found.add(name);
  }
  return [...found];
}
