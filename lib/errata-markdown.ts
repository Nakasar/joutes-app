import { getKeywordIdByName, getKeywordNamesPatternSource, KEYWORD_VALUE_SUFFIX_SOURCE } from "@/lib/riftbound-keywords";
import { replaceIconTags } from "@/lib/riftbound-icons";

// Either "KeywordName" with an optional associated value (named groups `kw`/`val`,
// e.g. "[Predict 2]", "[Equip [1]:rb_rune_body:]"), or any other bracketed
// mention not already a markdown link (named group `mention`), treated as a
// plain card-name reference, e.g. "[Leblanc, Deceiver]".
let combinedBracketRegex: RegExp | undefined;

function getCombinedBracketRegex(): RegExp {
  if (combinedBracketRegex !== undefined) return combinedBracketRegex;

  const namesPattern = getKeywordNamesPatternSource();
  const keywordAlt = namesPattern
    ? `\\[(?<kw>${namesPattern})(?<val>${KEYWORD_VALUE_SUFFIX_SOURCE})\\]|`
    : "";

  combinedBracketRegex = new RegExp(`${keywordAlt}\\[(?<mention>[^[\\]]+)\\](?!\\()`, "g");
  return combinedBracketRegex;
}

let plainKeywordRegex: RegExp | null | undefined;

function getPlainKeywordRegex(): RegExp | null {
  if (plainKeywordRegex !== undefined) return plainKeywordRegex;

  const namesPattern = getKeywordNamesPatternSource();
  // Bare mentions outside brackets never carry a value — only the keyword
  // name itself, e.g. plain prose mentioning "Deathknell".
  plainKeywordRegex = namesPattern ? new RegExp(`(${namesPattern})`, "g") : null;
  return plainKeywordRegex;
}

/** Every bracketed mention in the text, e.g. ["Leblanc, Deceiver"] for "...vs [Leblanc, Deceiver]...". */
export function extractBracketedMentions(text: string): string[] {
  const names = new Set<string>();
  const regex = /\[([^[\]]+)\](?!\()/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    names.add(match[1].trim());
  }

  return [...names];
}

/**
 * Rewrites errata markdown so that:
 * - a bracketed mention that is a keyword name, optionally followed by an
 *   associated value, e.g. `[Deathknell]`, `[Predict 2]`, or
 *   `[Equip [1]:rb_rune_body:]`, becomes `[Deathknell](keyword://808)` —
 *   with the value kept inside the badge;
 * - any other bracketed mention, e.g. `[Leblanc, Deceiver]` or
 *   `[Deathknell Bringer]` (a card name that merely starts with a keyword
 *   word, followed by another plain word rather than a value), is treated
 *   as a card-name reference instead — matching a card name becomes
 *   `[Leblanc, Deceiver](card://<id>)`; otherwise it's left as plain text
 *   rather than falling back to keyword styling;
 * - keyword mentions (Deathknell, Accelerate, ...) found anywhere else in the
 *   text become `[Deathknell](keyword://808)` links;
 * - `:rb_xxx:` glyph tags and bracket icon shorthands ([A], [1], [M], ...)
 *   become inline icon images.
 * The resulting string is still valid markdown; rendering code maps these
 * pseudo-protocols to styled components instead of real anchors.
 */
export function annotateErrataMarkdown(text: string, cardIdByName: Map<string, string>): string {
  const idByName = getKeywordIdByName();

  const applyPlainKeywords = (segment: string): string => {
    const regex = getPlainKeywordRegex();
    if (!regex) return segment;
    return segment.replace(regex, (matched) => {
      const id = idByName.get(matched);
      return id ? `[${matched}](keyword://${id})` : matched;
    });
  };

  const regex = getCombinedBracketRegex();
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  regex.lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    result += applyPlainKeywords(text.slice(lastIndex, match.index));

    if (match.groups?.kw) {
      const name = match.groups.kw;
      const value = match.groups.val ?? "";
      const keywordId = idByName.get(name);
      result += keywordId ? `[${name}${value}](keyword://${keywordId})` : match[0];
    } else {
      const name = (match.groups?.mention ?? "").trim();
      const cardId = cardIdByName.get(name.toLowerCase());
      // Unresolved, non-keyword brackets are left as plain text rather than
      // falling back to keyword styling (the bracket is part of a name,
      // e.g. "Deathknell Bringer", not a keyword mention).
      result += cardId ? `[${name}](card://${cardId})` : match[0];
    }

    lastIndex = match.index + match[0].length;
  }
  result += applyPlainKeywords(text.slice(lastIndex));

  return replaceIconTags(result);
}
