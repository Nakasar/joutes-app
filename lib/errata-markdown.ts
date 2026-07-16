import { getAllKeywordEntries } from "@/lib/rules/riftbound";

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
 * - known game keyword mentions (Deathknell, Accelerate, ...) become
 *   `[Deathknell](keyword://808)` links, and
 * - bracketed card-name mentions matching `cardIdByName` become
 *   `[Leblanc, Deceiver](card://<id>)` links.
 * The resulting string is still valid markdown; rendering code maps these
 * pseudo-protocols to styled components instead of real anchors.
 */
export function annotateErrataMarkdown(text: string, cardIdByName: Map<string, string>): string {
  const { regex: keywordRegex, idByName } = getKeywordMatcher();

  let result = text;

  if (keywordRegex) {
    result = result.replace(keywordRegex, (matched) => {
      const id = idByName.get(matched);
      return id ? `[${matched}](keyword://${id})` : matched;
    });
  }

  result = result.replace(BRACKET_MENTION_REGEX, (full, name: string) => {
    const cardId = cardIdByName.get(name.trim().toLowerCase());
    return cardId ? `[${name}](card://${cardId})` : full;
  });

  return result;
}
