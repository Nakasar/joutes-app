import { getAllKeywordEntries } from "@/lib/rules/riftbound";

// A keyword mention may carry an associated value after its name, e.g.
// "[Predict 2]", "[Assault 2]", or "[Equip [1]:rb_rune_body:]" — but not
// another plain word, which would indicate this is actually a card name
// (e.g. "[Deathknell Bringer]"), not a keyword mention. The value may itself
// contain one level of bracketed icon shorthand (`[1]`, `[M]`, ...) alongside
// digits, whitespace and `:rb_xxx:` glyph tags.
export const KEYWORD_VALUE_SUFFIX_SOURCE = String.raw`(?:[\s\d]|:[a-z0-9_]+:|\[[^\]]*\])*`;

// Some keywords (e.g. Level) are followed by a separate "[>]" bracket marking
// them as a "pointed" badge (a right-pointing arrow/chevron shape instead of
// the usual skewed one), e.g. "[Level 3][>]". Source data sometimes carries
// this as the HTML entity "[&gt;]" instead of the literal "[>]", so both are
// accepted. This is a shape marker, not visible text, so it's captured
// separately and dropped from the label.
export const KEYWORD_ARROW_SUFFIX_SOURCE = String.raw`(?:\s*\[(?:>|&gt;)\])?`;

let cache: { idByName: Map<string, string>; namesPattern: string | null } | null = null;

function getCache() {
  if (cache) return cache;

  const entries = getAllKeywordEntries();
  const idByName = new Map<string, string>();
  for (const entry of entries) {
    idByName.set(entry.name, entry.id);
  }

  const sortedNames = [...idByName.keys()].sort((a, b) => b.length - a.length);
  const escaped = sortedNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  cache = { idByName, namesPattern: escaped.length > 0 ? escaped.join("|") : null };
  return cache;
}

/** Keyword name (as it appears in the rules text, e.g. "Deathknell") to its rule id. */
export function getKeywordIdByName(): Map<string, string> {
  return getCache().idByName;
}

/** Source (no delimiters/flags/groups) of a regex alternation matching any known keyword name. */
export function getKeywordNamesPatternSource(): string | null {
  return getCache().namesPattern;
}
