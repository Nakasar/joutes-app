import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectFeedEntries } from "./feed-mix";

/**
 * Le choix des entrées d'un fil.
 *
 * Ce que ces cas verrouillent : un genre bavard ne prend pas toutes les places
 * **tant qu'une autre source peut les prendre**, et le fil ne reste pas à
 * moitié vide quand aucune ne le peut. Les deux moitiés de la règle se
 * contredisent en apparence, et c'est précisément pour ça qu'elles se testent
 * ensemble.
 *
 * Exécution : `npm run test`.
 */

type Entree = { type: "actu" | "deck" | "social"; id: string };

/** `a1 d2 s3` se lit « une actu, un deck, une publication », dans cet ordre. */
function entrees(suite: string): Entree[] {
  const genres = { a: "actu", d: "deck", s: "social" } as const;

  return suite.split(" ").map((jeton) => ({
    type: genres[jeton[0] as keyof typeof genres],
    id: jeton,
  }));
}

const ids = (liste: Entree[]) => liste.map((entree) => entree.id).join(" ");

describe("selectFeedEntries", () => {
  it("laisse passer un fil qui tient déjà sous le plafond", () => {
    const choix = selectFeedEntries(entrees("s1 a2 d3"), { max: 6, caps: { social: 2 } });

    assert.equal(ids(choix), "s1 a2 d3");
  });

  /*
   * Le cas qui définit la règle. Sans plafond, les six publications
   * prendraient les six places et `a7` comme `d8` seraient invisibles. Avec un
   * plafond **sec** à deux, on montrerait quatre entrées et deux trous alors
   * qu'il reste du contenu à montrer.
   *
   * Ce qu'on garantit est donc plus précis que « au plus deux » : c'est
   * **aucune autre source n'est évincée**. Les places qui restent ensuite
   * reviennent aux publications, faute de preneur.
   */
  it("garantit leur place aux autres sources, puis remplit avec le reste", () => {
    const choix = selectFeedEntries(entrees("s1 s2 s3 s4 s5 s6 a7 d8"), {
      max: 6,
      caps: { social: 2 },
    });

    assert.ok(ids(choix).includes("a7"), "l'actualité n'est jamais évincée");
    assert.ok(ids(choix).includes("d8"), "le deck n'est jamais évincé");
    assert.equal(choix.length, 6, "et les places libres ne restent pas vides");
    assert.equal(ids(choix), "s1 s2 s3 s4 a7 d8");
  });

  it("évince bien le trop-plein quand les autres sources sont assez nombreuses", () => {
    const choix = selectFeedEntries(entrees("s1 s2 s3 s4 s5 a6 d7 a8 d9"), {
      max: 6,
      caps: { social: 2 },
    });

    assert.equal(ids(choix), "s1 s2 a6 d7 a8 d9");
  });

  it("rend les places restantes aux entrées écartées, plutôt que de les laisser vides", () => {
    // Le même fil, mais rien d'autre à montrer : mieux vaut six publications
    // qu'un fil aux deux tiers vide, qui ressemblerait à une panne.
    const choix = selectFeedEntries(entrees("s1 s2 s3 s4 s5 s6 s7"), {
      max: 6,
      caps: { social: 2 },
    });

    assert.equal(ids(choix), "s1 s2 s3 s4 s5 s6");
  });

  it("garde l'ordre d'origine, y compris après remplissage", () => {
    // `s2` est écartée au premier temps puis reprise au second ; elle doit
    // revenir à sa place, pas se retrouver derrière `a9`.
    const choix = selectFeedEntries(entrees("s1 s2 s3 a9"), { max: 4, caps: { social: 1 } });

    assert.equal(ids(choix), "s1 s2 s3 a9");
  });

  it("ne plafonne pas un genre absent de la table", () => {
    const choix = selectFeedEntries(entrees("a1 a2 a3 a4"), { max: 6, caps: { social: 2 } });

    assert.equal(ids(choix), "a1 a2 a3 a4");
  });

  it("s'arrête au maximum demandé", () => {
    const choix = selectFeedEntries(entrees("a1 a2 a3 a4 a5 a6 a7 a8"), { max: 6 });

    assert.equal(choix.length, 6);
    assert.equal(ids(choix), "a1 a2 a3 a4 a5 a6");
  });

  it("rend une liste vide pour un maximum nul ou négatif", () => {
    for (const max of [0, -1]) {
      assert.deepEqual(selectFeedEntries(entrees("a1 s2"), { max }), []);
    }
  });

  it("ne jette pas sur un fil vide", () => {
    assert.deepEqual(selectFeedEntries([], { max: 6, caps: { social: 2 } }), []);
  });

  /*
   * Un plafond à zéro n'exclut pas : il repousse au remplissage. Le documenter
   * par un test évite qu'on l'emploie comme un filtre — ce qu'il n'est pas.
   */
  it("traite un plafond de zéro comme un report, pas comme une exclusion", () => {
    assert.equal(ids(selectFeedEntries(entrees("s1 a2"), { max: 6, caps: { social: 0 } })), "s1 a2");
  });
});
