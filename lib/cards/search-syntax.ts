import type { CardFilterFacet, CardSearchCriteria } from "@/lib/cards/search-filters";

/**
 * Syntaxe de recherche de la galerie de cartes : `domain:fury e<=3 deathknell`.
 *
 * Le vocabulaire n'est écrit nulle part — il est **déduit des facettes du jeu**
 * et des valeurs que porte réellement son catalogue, comme la barre latérale de
 * filtres. Riftbound obtient `energy`, `might`, `domain`… sans qu'aucun de ces
 * noms n'apparaisse ici.
 *
 * Un mot qui ne ressemble à aucun champ connu reste du texte libre : la barre
 * de recherche ne doit pas devenir un langage qu'il faut apprendre avant de
 * pouvoir taper un nom de carte.
 */

export type SearchFieldKind = "number" | "value" | "set" | "type" | "lang";

export type SearchField = {
  /** Nom canonique, celui que proposent les suggestions. */
  key: string;
  /** Raccourci d'une lettre, attribué seulement s'il ne désigne qu'un champ. */
  alias?: string;
  kind: SearchFieldKind;
  /** Valeurs acceptées, pour les champs qui en ont une liste. */
  values?: string[];
  min?: number;
  max?: number;
};

export type SearchToken = {
  /** Le mot tel qu'il a été tapé, pour pouvoir le retirer de la saisie. */
  raw: string;
  field: string;
  /** Libellé lisible, affiché en pastille. */
  label: string;
};

export type RejectedToken = {
  raw: string;
  field: string;
  reason: "value" | "number" | "operator";
};

export type ParsedSearch = {
  /** Ce qu'il reste une fois les tokens retirés : le nom ou le texte cherché. */
  text: string;
  /** Contraintes d'attributs, dans la forme qu'attendent déjà les filtres. */
  criteria: { ranges: CardSearchCriteria["ranges"]; values: CardSearchCriteria["values"] };
  setCode?: string;
  type?: string;
  lang?: string;
  tokens: SearchToken[];
  /** Champ reconnu, valeur inutilisable : à signaler plutôt qu'à ignorer. */
  rejected: RejectedToken[];
};

export type TokenSuggestion = {
  /** Le token complet à insérer. */
  token: string;
  /** Ce qu'il fait, en clair. */
  hint: string;
};

const OPERATOR_PATTERN = /^([A-Za-z][A-Za-z0-9_]*)(<=|>=|<|>|=|:)(.*)$/;

/** Champs communs, en plus des attributs du jeu. */
const CORE_FIELDS: { key: string; kind: SearchFieldKind }[] = [
  { key: "set", kind: "set" },
  { key: "type", kind: "type" },
  { key: "lang", kind: "lang" },
];

/**
 * Les champs sur lesquels la syntaxe sait porter, pour un jeu donné.
 *
 * Un raccourci d'une lettre n'est attribué que si une seule clé commence par
 * cette lettre : mieux vaut pas de raccourci qu'un `m` qui désignerait tantôt
 * `might`, tantôt `mana`.
 */
export function buildSearchFields(
  facets: CardFilterFacet[],
  { setCodes = [], types = [], languages = [] }: { setCodes?: string[]; types?: string[]; languages?: string[] } = {}
): SearchField[] {
  const fields: SearchField[] = [
    ...facets.map((facet): SearchField =>
      facet.type === "number"
        ? { key: facet.key, kind: "number", min: facet.min, max: facet.max }
        : { key: facet.key, kind: "value", values: facet.values }
    ),
    ...CORE_FIELDS.map((core): SearchField => ({
      ...core,
      values: core.kind === "set" ? setCodes : core.kind === "type" ? types : languages,
    })),
  ];

  const firstLetters = new Map<string, number>();
  for (const field of fields) {
    const letter = field.key[0]?.toLowerCase();
    if (letter) {
      firstLetters.set(letter, (firstLetters.get(letter) ?? 0) + 1);
    }
  }

  return fields.map((field) => {
    const letter = field.key[0]?.toLowerCase();
    return letter && firstLetters.get(letter) === 1 && letter !== field.key.toLowerCase()
      ? { ...field, alias: letter }
      : field;
  });
}

/**
 * Découpe la saisie en mots, en gardant d'un bloc ce qui est entre guillemets :
 * une valeur peut contenir une espace (`type:"Battlefield Rune"`).
 */
export function splitSearchWords(input: string): string[] {
  const words: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of input) {
    if (char === '"') {
      quoted = !quoted;
      current += char;
      continue;
    }
    if (!quoted && /\s/.test(char)) {
      if (current) {
        words.push(current);
      }
      current = "";
      continue;
    }
    current += char;
  }

  if (current) {
    words.push(current);
  }
  return words;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
    ? trimmed.slice(1, -1)
    : trimmed;
}

/** Le token s'écrit avec des guillemets dès que la valeur contient une espace. */
function formatToken(field: string, operator: string, value: string): string {
  return `${field}${operator}${/\s/.test(value) ? `"${value}"` : value}`;
}

function findField(fields: SearchField[], name: string): SearchField | undefined {
  const lower = name.toLowerCase();
  return (
    fields.find((field) => field.key.toLowerCase() === lower) ??
    fields.find((field) => field.alias === lower)
  );
}

/** La valeur telle qu'elle est écrite en base, retrouvée sans tenir compte de la casse. */
function canonicalValue(field: SearchField, value: string): string | undefined {
  const lower = value.toLowerCase();
  return field.values?.find((candidate) => candidate.toLowerCase() === lower);
}

/**
 * Bornes d'un token numérique. `<` et `>` sont stricts : la borne inclusive
 * équivalente est prise sur l'entier voisin, ce qui est exactement ce que veut
 * dire « moins de 3 » pour une énergie ou une puissance.
 */
function numericBounds(operator: string, value: number): { min?: number; max?: number } | undefined {
  switch (operator) {
    case "=":
      return { min: value, max: value };
    case "<=":
      return { max: value };
    case ">=":
      return { min: value };
    case "<":
      return { max: Math.ceil(value) - 1 };
    case ">":
      return { min: Math.floor(value) + 1 };
    default:
      // `:` reste au texte libre sur un champ numérique : `e:OGN` désigne
      // depuis toujours une extension dans la recherche de cartes.
      return undefined;
  }
}

function mergeRange(
  current: { min?: number; max?: number } | undefined,
  next: { min?: number; max?: number }
): { min?: number; max?: number } {
  const min = [current?.min, next.min].filter((value): value is number => value !== undefined);
  const max = [current?.max, next.max].filter((value): value is number => value !== undefined);

  return {
    // Deux bornes sur le même attribut se cumulent : la plus restrictive gagne.
    ...(min.length > 0 ? { min: Math.max(...min) } : {}),
    ...(max.length > 0 ? { max: Math.min(...max) } : {}),
  };
}

/** Lit la saisie : ce qui est un token devient une contrainte, le reste est du texte. */
export function parseSearchSyntax(input: string, fields: SearchField[]): ParsedSearch {
  const parsed: ParsedSearch = {
    text: "",
    criteria: { ranges: {}, values: {} },
    tokens: [],
    rejected: [],
  };
  const words: string[] = [];

  for (const word of splitSearchWords(input)) {
    const match = OPERATOR_PATTERN.exec(word);
    const field = match ? findField(fields, match[1]) : undefined;

    if (!match || !field) {
      words.push(word);
      continue;
    }

    const [, , operator, rawValue] = match;
    const value = unquote(rawValue);

    if (!value) {
      words.push(word);
      continue;
    }

    if (field.kind === "number") {
      const bounds = numericBounds(operator, Number(value));
      if (!bounds) {
        // Opérateur sans signification ici : le mot retourne au texte libre,
        // où les filtres historiques de la recherche peuvent encore le lire.
        words.push(word);
        continue;
      }
      if (!Number.isFinite(Number(value))) {
        parsed.rejected.push({ raw: word, field: field.key, reason: "number" });
        continue;
      }
      parsed.criteria.ranges[field.key] = mergeRange(parsed.criteria.ranges[field.key], bounds);
      parsed.tokens.push({ raw: word, field: field.key, label: `${field.key} ${operator} ${value}` });
      continue;
    }

    if (operator !== ":" && operator !== "=") {
      parsed.rejected.push({ raw: word, field: field.key, reason: "operator" });
      continue;
    }

    const canonical = canonicalValue(field, value);
    if (canonical === undefined) {
      parsed.rejected.push({ raw: word, field: field.key, reason: "value" });
      continue;
    }

    if (field.kind === "set") {
      parsed.setCode = canonical;
    } else if (field.kind === "type") {
      parsed.type = canonical;
    } else if (field.kind === "lang") {
      parsed.lang = canonical;
    } else {
      const current = parsed.criteria.values[field.key] ?? [];
      if (!current.includes(canonical)) {
        parsed.criteria.values[field.key] = [...current, canonical];
      }
    }

    parsed.tokens.push({ raw: word, field: field.key, label: `${field.key} · ${canonical}` });
  }

  parsed.text = words.join(" ");
  return parsed;
}

/**
 * Fusionne les contraintes de la saisie avec celles de la barre latérale.
 * Plusieurs valeurs d'un même attribut s'entendent comme un « ou » — elles se
 * réunissent donc ; deux bornes se cumulent, la plus restrictive gagnant.
 */
export function mergeSearchCriteria(
  base: CardSearchCriteria,
  fromQuery: ParsedSearch["criteria"]
): CardSearchCriteria {
  const ranges = { ...base.ranges };
  for (const [key, range] of Object.entries(fromQuery.ranges)) {
    ranges[key] = mergeRange(ranges[key], range);
  }

  const values = { ...base.values };
  for (const [key, list] of Object.entries(fromQuery.values)) {
    values[key] = [...new Set([...(values[key] ?? []), ...list])];
  }

  return { ...base, ranges, values };
}

/** Retire un mot de la saisie — la pastille d'un token qu'on enlève d'un clic. */
export function removeSearchWord(input: string, raw: string): string {
  const words = splitSearchWords(input);
  const index = words.indexOf(raw);
  if (index === -1) {
    return input;
  }
  return [...words.slice(0, index), ...words.slice(index + 1)].join(" ");
}

/** Le mot en cours de frappe : celui que les suggestions vont compléter. */
export function currentWord(input: string): string {
  if (!input || /\s$/.test(input)) {
    return "";
  }
  const words = splitSearchWords(input);
  return words[words.length - 1] ?? "";
}

/** Remplace le mot en cours par le token choisi, et laisse le curseur prêt pour le suivant. */
export function applyTokenSuggestion(input: string, token: string): string {
  const partial = currentWord(input);
  const base = partial ? input.slice(0, input.length - partial.length) : input;
  return `${base}${token} `;
}

const MAX_VALUES_PER_FIELD = 6;

function numericExamples(field: SearchField): TokenSuggestion[] {
  const min = field.min ?? 0;
  const max = field.max ?? 0;
  if (max <= min) {
    return [{ token: `${field.key}=${min}`, hint: `${field.key} vaut ${min}` }];
  }

  const low = Math.round(min + (max - min) / 3);
  const high = Math.round(max - (max - min) / 3);
  return [
    { token: `${field.key}<=${low}`, hint: `${field.key} au plus ${low}` },
    { token: `${field.key}>=${high}`, hint: `${field.key} au moins ${high}` },
  ];
}

function fieldSuggestions(field: SearchField): TokenSuggestion[] {
  if (field.kind === "number") {
    return numericExamples(field);
  }
  return (field.values ?? []).slice(0, MAX_VALUES_PER_FIELD).map((value) => ({
    token: formatToken(field.key, ":", value),
    hint: `${field.key} : ${value}`,
  }));
}

/**
 * Suggestions pour le mot en cours de frappe.
 *
 * Trois situations : rien de tapé (on montre ce que le jeu sait faire), un
 * champ déjà suivi de son séparateur (on complète par ses valeurs réelles), ou
 * un début de mot (on cherche parmi les champs et leurs valeurs).
 */
export function suggestTokens(
  input: string,
  fields: SearchField[],
  { limit = 8 }: { limit?: number } = {}
): TokenSuggestion[] {
  const partial = currentWord(input);
  const used = new Set(parseSearchSyntax(input, fields).tokens.map((token) => token.raw.toLowerCase()));

  if (!partial) {
    return fields
      .flatMap((field) => fieldSuggestions(field).slice(0, 1))
      .filter((suggestion) => !used.has(suggestion.token.toLowerCase()))
      .slice(0, limit);
  }

  const match = OPERATOR_PATTERN.exec(partial);
  const field = match ? findField(fields, match[1]) : undefined;

  if (match && field) {
    const [, , operator, rawValue] = match;
    const typed = unquote(rawValue).toLowerCase();

    if (field.kind === "number") {
      return numericExamples(field)
        .filter((suggestion) => suggestion.token.toLowerCase().startsWith(partial.toLowerCase()))
        .concat(typed ? [] : numericExamples(field))
        .slice(0, limit);
    }

    return (field.values ?? [])
      .filter((value) => value.toLowerCase().includes(typed))
      .slice(0, limit)
      .map((value) => ({
        token: formatToken(field.key, operator === "=" ? "=" : ":", value),
        hint: `${field.key} : ${value}`,
      }));
  }

  // Début de mot : les champs dont le nom commence ainsi, puis les valeurs qui
  // le contiennent — taper « fury » doit proposer `domain:fury` sans qu'on ait
  // à deviner le nom du champ.
  const lower = partial.toLowerCase();
  const byField = fields
    .filter((item) => item.key.toLowerCase().startsWith(lower) || item.alias === lower)
    .flatMap((item) => fieldSuggestions(item));

  const byValue = fields.flatMap((item) =>
    item.kind === "number"
      ? []
      : (item.values ?? [])
          .filter((value) => value.toLowerCase().startsWith(lower))
          .map((value) => ({
            token: formatToken(item.key, ":", value),
            hint: `${item.key} : ${value}`,
          }))
  );

  const seen = new Set<string>();
  return [...byField, ...byValue]
    .filter((suggestion) => {
      const key = suggestion.token.toLowerCase();
      if (seen.has(key) || used.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
