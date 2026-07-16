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
  if (cardNames.length === 0) return text;

  const sorted = [...cardNames].sort((a, b) => b.length - a.length);
  const namesPattern = sorted.map(escapeRegExp).join("|");
  const regex = new RegExp(
    `(\\[[^\\]]*\\])|(?<![\\p{L}\\p{N}])(${namesPattern})(?![\\p{L}\\p{N}])`,
    "giu"
  );

  return text.replace(regex, (match, alreadyBracketed: string | undefined, cardName: string | undefined) =>
    alreadyBracketed ?? `[${cardName}]`
  );
}
