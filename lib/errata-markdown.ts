import { getAllKeywordEntries } from "@/lib/rules/riftbound";
import { replaceIconTags } from "@/lib/riftbound-icons";

// A bracketed mention not immediately followed by "(" — i.e. not already a
// markdown link — is treated as a plain card-name reference, e.g. "[Leblanc, Deceiver]".
const BRACKET_MENTION_REGEX = /\[([^[\]]+)\](?!\()/g;

let keywordMatcher: { regex: RegExp | null; idByName: Map<string, string> } | null = null;

function getKeywordMatcher() {
  if (keywordMatcher) return keywordMatcher;

  const entries = getAllKeywordEntries();
  const idByName = new Map<string, string>();
  for (const entry of entries) {
    idByName.set(entry.name, entry.id);
  }

  const sortedNames = [...idByName.keys()].sort((a, b) => b.length - a.length);
  const escaped = sortedNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = escaped.length > 0 ? new RegExp(`(${escaped.join("|")})`, "g") : null;

  keywordMatcher = { regex, idByName };
  return keywordMatcher;
}

/** Every bracketed mention in the text, e.g. ["Leblanc, Deceiver"] for "...vs [Leblanc, Deceiver]...". */
export function extractBracketedMentions(text: string): string[] {
  const names = new Set<string>();
  let match: RegExpExecArray | null;

  BRACKET_MENTION_REGEX.lastIndex = 0;
  while ((match = BRACKET_MENTION_REGEX.exec(text)) !== null) {
    names.add(match[1].trim());
  }

  return [...names];
}

/**
 * Rewrites errata markdown so that:
 * - bracketed mentions, e.g. `[Leblanc, Deceiver]`, that match a card name
 *   become `[Leblanc, Deceiver](card://<id>)` links — and are never treated
 *   as keyword mentions, even if the card name happens to contain a keyword
 *   word, since the brackets mark it as a card reference here, not a keyword;
 * - keyword mentions (Deathknell, Accelerate, ...) found anywhere else in the
 *   text become `[Deathknell](keyword://808)` links;
 * - `:rb_xxx:` glyph tags become inline icon images.
 * The resulting string is still valid markdown; rendering code maps these
 * pseudo-protocols to styled components instead of real anchors.
 */
export function annotateErrataMarkdown(text: string, cardIdByName: Map<string, string>): string {
  const { regex: keywordRegex, idByName } = getKeywordMatcher();

  const applyKeywords = (segment: string): string => {
    if (!keywordRegex) return segment;
    return segment.replace(keywordRegex, (matched) => {
      const id = idByName.get(matched);
      return id ? `[${matched}](keyword://${id})` : matched;
    });
  };

  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  BRACKET_MENTION_REGEX.lastIndex = 0;
  while ((match = BRACKET_MENTION_REGEX.exec(text)) !== null) {
    result += applyKeywords(text.slice(lastIndex, match.index));

    const name = match[1].trim();
    const cardId = cardIdByName.get(name.toLowerCase());
    // Bracketed mentions are always card references here, never keyword
    // mentions — even when unresolved, keep the plain text instead of
    // falling back to keyword styling (the bracket is part of a name).
    result += cardId ? `[${name}](card://${cardId})` : match[0];

    lastIndex = match.index + match[0].length;
  }
  result += applyKeywords(text.slice(lastIndex));

  return replaceIconTags(result);
}
