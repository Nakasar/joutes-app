const ENERGY_TAG_REGEX = /:rb_energy_(\d+):/g;
const RUNE_TAG_REGEX = /:rb_rune_([a-z]+):/g;

/**
 * Converts a card's raw `:rb_xxx:` glyph tags into the plain bracket
 * shorthand players commonly use outside the app (forums, deck lists, ...):
 * `:rb_energy_4:` -> `[4]`, `:rb_rune_rainbow:` -> `[A]`, any other
 * `:rb_rune_<color>:` -> `[C]`, `:rb_might:` -> `[M]`, `:rb_exhaust:` -> `[E]`.
 */
export function rbGlyphsToBracketText(text: string): string {
  return text
    .replace(ENERGY_TAG_REGEX, (_match, n: string) => `[${n}]`)
    .replace(RUNE_TAG_REGEX, (_match, color: string) => (color === "rainbow" ? "[A]" : "[C]"))
    .replace(/:rb_might:/g, "[M]")
    .replace(/:rb_exhaust:/g, "[E]");
}
