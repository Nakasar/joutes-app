import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LAIR_ACCENT_PALETTE, readLairAccent } from "./theme";

/**
 * L'accent d'un lieu.
 *
 * Ce qui compte ici : un lieu sans accent ne pose aucune variable — la page
 * garde alors les couleurs de Joutes —, et le texte posé sur un aplat d'accent
 * bascule du sombre au clair selon la luminosité de celui-ci, faute de quoi les
 * boutons du lieu deviennent illisibles.
 *
 * Exécution : `npm run test`.
 */

/** Les propriétés personnalisées posées en ligne, lisibles par leur nom. */
const varsOf = (style: React.CSSProperties) => style as unknown as Record<string, string>;

describe("readLairAccent", () => {
  it("ne pose rien sans accent enregistré", () => {
    const accent = readLairAccent({ options: undefined });

    assert.equal(accent.color, null);
    assert.deepEqual(accent.style, {});
    assert.equal(accent.tintSurfaces, false);
  });

  it("ne pose rien pour une valeur qui n'est pas une couleur hexadécimale", () => {
    for (const accentColor of ["rouge", "rgb(1,2,3)", "#12", "#12345"]) {
      assert.equal(readLairAccent({ options: { theme: { accentColor } } }).color, null, accentColor);
    }
  });

  it("normalise une écriture courte et une casse mixte", () => {
    assert.equal(readLairAccent({ options: { theme: { accentColor: "#DA5" } } }).color, "#ddaa55");
    assert.equal(readLairAccent({ options: { theme: { accentColor: "#D8A150" } } }).color, "#d8a150");
  });

  it("pose un texte sombre sur un accent clair et clair sur un accent sombre", () => {
    const clair = varsOf(readLairAccent({ options: { theme: { accentColor: "#D8A150" } } }).style);
    const sombre = varsOf(readLairAccent({ options: { theme: { accentColor: "#3B1D6E" } } }).style);

    assert.equal(clair["--lair-accent"], "#d8a150");
    assert.match(clair["--lair-accent-foreground"], /oklch\(0\.16/);
    assert.match(sombre["--lair-accent-foreground"], /oklch\(0\.99/);
  });

  it("garde toute la palette proposée lisible en aplat", () => {
    for (const accentColor of LAIR_ACCENT_PALETTE) {
      const style = varsOf(readLairAccent({ options: { theme: { accentColor } } }).style);
      assert.ok(style["--lair-accent-foreground"], accentColor);
    }
  });

  it("rapporte la teinte des cartes uniquement lorsqu'elle est demandée", () => {
    const options = { theme: { accentColor: "#22D3EE", tintSurfaces: true } };

    assert.equal(readLairAccent({ options }).tintSurfaces, true);
    assert.equal(readLairAccent({ options: { theme: { accentColor: "#22D3EE" } } }).tintSurfaces, false);
  });
});
