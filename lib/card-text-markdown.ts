import {
  getKeywordIdByName,
  getKeywordNamesPatternSource,
  KEYWORD_ARROW_SUFFIX_SOURCE,
  KEYWORD_VALUE_SUFFIX_SOURCE,
} from "@/lib/riftbound-keywords";
import { replaceIconTags } from "@/lib/riftbound-icons";

let bracketKeywordRegex: RegExp | null | undefined;

function getBracketKeywordRegex(): RegExp | null {
  if (bracketKeywordRegex !== undefined) return bracketKeywordRegex;

  const namesPattern = getKeywordNamesPatternSource();
  bracketKeywordRegex = namesPattern
    ? new RegExp(`\\[(${namesPattern})(${KEYWORD_VALUE_SUFFIX_SOURCE})\\](${KEYWORD_ARROW_SUFFIX_SOURCE})`, "g")
    : null;
  return bracketKeywordRegex;
}

/**
 * Rewrites a card's ability text so that:
 * - bracketed keyword mentions, e.g. `[Accelerate]`, `[Assault 4]`, or
 *   `[Equip [1]:rb_rune_body:]` (the game's own markup for a card's keyword
 *   abilities, optionally carrying an associated value), become
 *   `[Accelerate](keyword://805)` links, with the value kept inside the badge;
 * - a keyword mention followed by a separate `[>]` bracket, e.g.
 *   `[Level 3][>]`, becomes a single badge rendered with a pointed
 *   (right-arrow) shape instead of the usual skewed one;
 * - `:rb_xxx:` glyph tags become inline icon images;
 * - single line breaks (from stripped `<br />` tags) become real paragraph
 *   breaks.
 * The resulting string is still valid markdown; rendering code maps the
 * `keyword://` pseudo-protocol to a styled component instead of a real anchor.
 */
export function annotateCardText(text: string): string {
  const idByName = getKeywordIdByName();
  const regex = getBracketKeywordRegex();

  let result = text.replace(/\n+/g, "\n\n");

  if (regex) {
    result = result.replace(regex, (full, name: string, value: string, arrowSuffix: string) => {
      const id = idByName.get(name);
      if (!id) return full;
      return `[${name}${value}](keyword://${id}${arrowSuffix ? "/arrow" : ""})`;
    });
  }

  return replaceIconTags(result);
}
