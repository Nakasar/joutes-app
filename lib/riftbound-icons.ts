// Riftbound card/rules text embeds inline glyphs as `:rb_<name>:` tags (e.g.
// `:rb_energy_1:`, `:rb_might:`). Rewriting them as markdown images lets the
// existing ReactMarkdown rendering turn them into actual icons.
const ICON_TAG_REGEX = /:rb_([a-z0-9_]+):/g;
const ICON_BASE_URL = "https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest";

export function replaceIconTags(text: string): string {
  return text.replace(ICON_TAG_REGEX, (_full, name: string) => `![${name}](${ICON_BASE_URL}/${name}.svg)`);
}
