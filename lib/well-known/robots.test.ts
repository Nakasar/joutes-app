import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BLOCKED_AGENTS, buildRobotsTxt, CONTENT_SIGNAL, META_DISALLOWS } from "./robots";

/**
 * `robots.txt` et ses Content Signals.
 *
 * Le piège tient à la forme du fichier : une directive posée hors d'un groupe
 * `User-Agent` est ignorée sans un mot, et la déclaration a l'air faite alors
 * qu'elle ne dit rien à personne.
 *
 * Exécution : `npm run test`.
 */

/** Lignes utiles du fichier : ni vides, ni commentaires. */
function directives(robots: string): string[] {
  return robots
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

describe("buildRobotsTxt", () => {
  it("déclare le Content-Signal dans un groupe User-Agent", () => {
    const lines = directives(buildRobotsTxt());
    const signal = lines.findIndex((line) => line.startsWith("Content-Signal:"));
    assert.notEqual(signal, -1, "aucune directive Content-Signal");

    // Le groupe s'ouvre sur la dernière ligne `User-Agent` qui précède, et une
    // ligne hors groupe (`Sitemap`) le referme.
    const before = lines.slice(0, signal);
    const opener = before.findLastIndex((line) => line.startsWith("User-Agent:"));
    assert.notEqual(opener, -1, "Content-Signal posé avant tout groupe User-Agent");
    assert.ok(
      before.slice(opener).every((line) => !line.startsWith("Sitemap:")),
      "Content-Signal séparé de son groupe par une ligne hors groupe"
    );
  });

  it("n'annonce que les trois signaux définis, chacun une fois", () => {
    const [, value] = buildRobotsTxt().match(/^Content-Signal:\s*(.+)$/m) ?? [];
    assert.ok(value, "Content-Signal illisible");

    const signals = value.split(",").map((entry) => entry.trim().split("="));
    assert.deepEqual(
      signals.map(([name]) => name).sort(),
      ["ai-input", "ai-train", "search"],
      "signaux inattendus, manquants ou répétés"
    );
    for (const [name, state] of signals) {
      assert.ok(state === "yes" || state === "no", `${name} vaut « ${state} »`);
    }
    assert.equal(value, CONTENT_SIGNAL);
  });

  it("garde les règles et les sitemaps d'avant", () => {
    // Les Content Signals s'ajoutent à `robots.txt` ; ils ne le remplacent pas.
    const lines = directives(buildRobotsTxt());

    assert.ok(lines.includes("Allow: /"));
    assert.ok(lines.includes("Disallow: /admin/"));
    assert.ok(lines.includes("Sitemap: https://www.joutes.app/sitemap.xml"));
    assert.ok(lines.includes("Sitemap: https://www.joutes.app/sitemap_index.xml"));
  });

  it("ferme la méta aux robots", () => {
    const lines = directives(buildRobotsTxt());
    const wildcard = lines.indexOf("User-Agent: *");
    const nextGroup = lines.findIndex((line, index) => index > wildcard && line.startsWith("User-Agent:"));
    const group = lines.slice(wildcard, nextGroup === -1 ? undefined : nextGroup);
    for (const path of META_DISALLOWS) assert.ok(group.includes(`Disallow: ${path}`), `${path} absent du groupe *`);
  });

  it("donne aux robots bloqués leur propre groupe", () => {
    const lines = directives(buildRobotsTxt());
    for (const agent of BLOCKED_AGENTS) {
      const opener = lines.indexOf(`User-Agent: ${agent}`);
      assert.notEqual(opener, -1, `${agent} absent`);
      assert.equal(lines[opener + 1], "Disallow: /");
    }
  });
});
