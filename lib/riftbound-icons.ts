// Riftbound card/rules text embeds inline glyphs as `:rb_<name>:` tags (e.g.
// `:rb_energy_1:`, `:rb_might:`). Rewriting them as markdown images lets the
// existing ReactMarkdown rendering turn them into actual icons.
const ICON_TAG_REGEX = /:rb_([a-z0-9_]+):/g;
const ICON_BASE_URL = "https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest";

// A handful of common glyphs also appear as a bracket shorthand instead of
// `:rb_x:` tags: [A]/[C] for a rainbow (any-color) rune cost, [M] for Might,
// and [<n>] for an Energy cost of n.
const BRACKET_ICON_REGEX = /\[(A|C|M|\d+)\]/g;
const BRACKET_ICON_NAMES: Record<string, string> = {
  A: "rune_rainbow",
  C: "rune_rainbow",
  M: "might",
};

function iconUrl(name: string): string {
  return `${ICON_BASE_URL}/${name}.svg`;
}

export function replaceIconTags(text: string): string {
  let result = text.replace(ICON_TAG_REGEX, (_full, name: string) => `![${name}](${iconUrl(name)})`);

  result = result.replace(BRACKET_ICON_REGEX, (_full, token: string) => {
    const name = /^\d+$/.test(token) ? `energy_${token}` : BRACKET_ICON_NAMES[token];
    return `![${name}](${iconUrl(name)})`;
  });

  return result;
}
