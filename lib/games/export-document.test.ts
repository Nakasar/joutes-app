import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gameExportChunks, type GameExportSource } from "@/lib/games/export-document";

/**
 * Tests du document d'export. Le document n'est plus assemblé en mémoire mais
 * écrit morceau par morceau : une virgule en trop ou un crochet oublié ne se
 * verrait qu'au téléchargement, chez tous les clients hors ligne à la fois.
 * D'où la vérification systématique par relecture du JSON produit.
 *
 * Exécution : `npm run test`.
 */

const GENERATED_AT = new Date("2026-08-04T09:00:00.000Z");

async function* asAsync<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

function source(overrides: Partial<GameExportSource> = {}): GameExportSource {
  return {
    game: { id: "g1", slug: "riftbound", name: "Riftbound" },
    generatedAt: GENERATED_AT,
    cards: asAsync([]),
    erratas: [],
    policies: [],
    ...overrides,
  };
}

/** Concatène les fragments et relit le document, comme le ferait un client. */
async function build(input: GameExportSource): Promise<Record<string, unknown>> {
  let json = "";
  for await (const chunk of gameExportChunks(input)) json += chunk;
  return JSON.parse(json) as Record<string, unknown>;
}

describe("gameExportChunks", () => {
  it("produit le document attendu par les clients hors ligne", async () => {
    const cards = [
      { id: "UNL-001", name: "Abandon", energy: 3 },
      { id: "UNL-002", name: "Bastion", energy: 5 },
    ];
    const document = await build(
      source({
        cards: asAsync(cards),
        erratas: [{ id: "e1", details: "texte" }],
        policies: [{ id: "p1", title: "Politique" }],
        rules: { en: { cr: [{ id: "1.1", content: "règle" }] } },
      })
    );

    assert.deepEqual(document.game, { id: "g1", slug: "riftbound", name: "Riftbound" });
    assert.equal(document.generatedAt, GENERATED_AT.toISOString());
    assert.deepEqual(document.cards, cards);
    assert.deepEqual(document.erratas, [{ id: "e1", details: "texte" }]);
    assert.deepEqual(document.policies, [{ id: "p1", title: "Politique" }]);
    assert.deepEqual(document.rules, { en: { cr: [{ id: "1.1", content: "règle" }] } });
  });

  it("reste un JSON valide sans aucune donnée", async () => {
    const document = await build(source());
    assert.deepEqual(document.cards, []);
    assert.deepEqual(document.erratas, []);
    assert.deepEqual(document.policies, []);
  });

  it("omet les règles quand le jeu n'en publie pas", async () => {
    // Champ absent et non `null` : c'est ce que produisait la sérialisation
    // d'un objet dont la propriété vaut `undefined`, et les clients déployés
    // lisent `rules` comme optionnel.
    const document = await build(source());
    assert.equal("rules" in document, false);
  });

  it("sépare correctement un seul élément et de nombreux éléments", async () => {
    const one = await build(source({ cards: asAsync([{ id: "a" }]) }));
    assert.deepEqual(one.cards, [{ id: "a" }]);

    const many = Array.from({ length: 500 }, (_, index) => ({ id: `c${index}` }));
    const lots = await build(source({ cards: asAsync(many) }));
    assert.deepEqual(lots.cards, many);
  });

  it("n'accumule pas le document dans un seul fragment", async () => {
    // La garantie de mémoire tient à ce que les cartes sortent une par une :
    // un fragment par carte, plus l'enveloppe. Si un jour la sérialisation
    // repassait par une grande chaîne, ce test le dirait.
    const cards = Array.from({ length: 100 }, (_, index) => ({ id: `c${index}` }));
    const chunks: string[] = [];
    for await (const chunk of gameExportChunks(source({ cards: asAsync(cards) }))) {
      chunks.push(chunk);
    }

    assert.ok(chunks.length > cards.length, `fragments : ${chunks.length}`);
    const longest = Math.max(...chunks.map((chunk) => chunk.length));
    assert.ok(longest < 200, `plus grand fragment : ${longest} caractères`);
  });

  it("échappe ce qui casserait le document", async () => {
    // Un nom de carte porte des guillemets et des retours à la ligne bien plus
    // souvent qu'on ne le croit ; c'est `JSON.stringify` qui s'en charge, mais
    // il opère ici par fragment et non sur le document entier.
    const card = { name: 'Épée "brisée"\nen deux', text: "a\\b\tc" };
    const document = await build(source({ cards: asAsync([card]) }));
    assert.deepEqual(document.cards, [card]);
  });
});
