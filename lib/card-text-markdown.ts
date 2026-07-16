import { getAllKeywordEntries } from "@/lib/rules/riftbound";
import { replaceIconTags } from "@/lib/riftbound-icons";

let bracketKeywordMatcher: { regex: RegExp | null; idByName: Map<string, string> } | null = null;

function getBracketKeywordMatcher() {
  if (bracketKeywordMatcher) return bracketKeywordMatcher;

  const entries = getAllKeywordEntries();
  const idByName = new Map<string, string>();
  for (const entry of entries) {
    idByName.set(entry.name, entry.id);
  }

  const sortedNames = [...idByName.keys()].sort((a, b) => b.length - a.length);
  const escaped = sortedNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // A keyword mention on a card is always written in brackets, optionally
  // followed by a value, e.g. "[Accelerate]" or "[Assault 4]".
  const regex = escaped.length > 0 ? new RegExp(`\\[(${escaped.join("|")})([^\\]]*)\\]`, "g") : null;

  bracketKeywordMatcher = { regex, idByName };
  return bracketKeywordMatcher;
}

/**
 * Rewrites a card's ability text so that:
 * - bracketed keyword mentions, e.g. `[Accelerate]` or `[Assault 4]` (the
 *   game's own markup for a card's keyword abilities), become
 *   `[Accelerate](keyword://805)` links;
 * - `:rb_xxx:` glyph tags become inline icon images;
 * - single line breaks (from stripped `<br />` tags) become real paragraph
 *   breaks.
 * The resulting string is still valid markdown; rendering code maps the
 * `keyword://` pseudo-protocol to a styled component instead of a real anchor.
 */
export function annotateCardText(text: string): string {
  const { regex, idByName } = getBracketKeywordMatcher();

  let result = text.replace(/\n+/g, "\n\n");

  if (regex) {
    result = result.replace(regex, (full, name: string, rest: string) => {
      const id = idByName.get(name);
      return id ? `[${name}${rest}](keyword://${id})` : full;
    });
  }

  return replaceIconTags(result);
}
