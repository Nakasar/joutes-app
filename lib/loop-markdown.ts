function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wraps every plain-text mention of a known card name in brackets (e.g.
 * "...vs Diana, Lunari..." -> "...vs [Diana, Lunari]..."), leaving text
 * already inside brackets untouched. Feeding the result to
 * `annotateErrataMarkdown` then turns these into `card://id` links using its
 * existing bracket-handling logic, without duplicating any of it here.
 *
 * Names are tried longest-first so a card whose name is a prefix of another
 * (e.g. "Diana" vs "Diana, Lunari") doesn't shadow the longer match, and
 * matches require a non-letter/digit boundary so short names don't fire
 * inside unrelated words.
 */
export function bracketPlainCardMentions(text: string, cardNames: string[]): string {
  return createCardMentionBracketer(cardNames)(text);
}

/**
 * Même traitement, mais l'expression est compilée une seule fois pour être
 * appliquée à plusieurs textes. Le catalogue d'un jeu pèse des dizaines de
 * milliers de noms : recompiler par texte coûterait cher là où l'appelant en
 * annote beaucoup (import d'un quizz, qui traite chaque énoncé, chaque
 * proposition et chaque explication).
 */
export function createCardMentionBracketer(cardNames: string[]): (text: string) => string {
  if (cardNames.length === 0) return (text) => text;

  const sorted = [...cardNames].sort((a, b) => b.length - a.length);
  const namesPattern = sorted.map(escapeRegExp).join("|");
  const regex = new RegExp(
    `(\\[[^\\]]*\\])|(?<![\\p{L}\\p{N}])(${namesPattern})(?![\\p{L}\\p{N}])`,
    "giu"
  );

  return (text: string) =>
    text.replace(regex, (match, alreadyBracketed: string | undefined, cardName: string | undefined) =>
      alreadyBracketed ?? `[${cardName}]`
    );
}

/**
 * Parties d'un markdown qu'une mise entre crochets ne doit pas traverser :
 * blocs et fragments de code, liens et images entiers (destination comprise),
 * balises HTML, et URL nues.
 *
 * Un seul groupe capturant, pour que `split` rende alternativement du texte
 * (rang pair) et du protégé (rang impair).
 */
const PROTECTED_MARKDOWN_PATTERN =
  /(```[\s\S]*?```|`[^`\n]*`|!?\[[^\]]*\]\([^)]*\)|<[^>\n]+>|https?:\/\/\S+)/g;

/**
 * Même mise entre crochets, mais appliquée à un markdown plutôt qu'à du texte
 * brut : le nom d'une carte croisé dans l'adresse d'une image ou d'un lien y
 * casserait la syntaxe (`![](…/[Flash]-1848x1063.jpg)`), et dans un bloc de
 * code il n'aurait rien à faire.
 *
 * Sert à l'import d'une actualité, dont le corps arrive déjà en markdown avec
 * ses images ; l'import d'un quizz, lui, part de texte libre et se contente de
 * `createCardMentionBracketer`.
 */
export function createMarkdownCardMentionBracketer(cardNames: string[]): (markdown: string) => string {
  if (cardNames.length === 0) return (markdown) => markdown;

  const bracket = createCardMentionBracketer(cardNames);

  return (markdown: string) =>
    markdown
      .split(PROTECTED_MARKDOWN_PATTERN)
      .map((segment, index) => (index % 2 === 1 ? segment : bracket(segment)))
      .join("");
}
