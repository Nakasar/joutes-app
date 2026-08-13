import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_META_DESCRIPTION_LENGTH, quizIntroDescription } from "./seo";
import type { QuizBlock } from "@/lib/types/Quiz";

/**
 * Tests de la description d'un quizz. Deux choses s'y jouent : ne montrer que
 * ce qui précède la première question — le reste commente les réponses, et le
 * donner en description dévoilerait ce que le quizz demande — et rendre du
 * texte brut, une méta-description affichant sinon ses astérisques.
 *
 * Exécution : `npm run test`.
 */

const markdown = (content: string): QuizBlock => ({ id: "b1", type: "markdown", content });
const form = (): QuizBlock => ({ id: "f1", type: "form", questions: [], showSubmitButton: true });

describe("quizIntroDescription", () => {
  it("reprend l'introduction du quizz", () => {
    assert.equal(
      quizIntroDescription([markdown("Vingt questions sur les règles de tournoi."), form()]),
      "Vingt questions sur les règles de tournoi."
    );
  });

  it("s'arrête à la première question", () => {
    // Ce qui suit commente les réponses : le donner en description dévoilerait
    // ce que le quizz demande.
    assert.equal(
      quizIntroDescription([markdown("Prêt ?"), form(), markdown("La bonne réponse était B.")]),
      "Prêt ?"
    );
  });

  it("rend du texte brut, sans balisage", () => {
    const blocks = [
      markdown("# Les rulings\n\nUn quizz **difficile** sur les [politiques](https://joutes.app/p) de jeu."),
    ];

    assert.equal(
      quizIntroDescription(blocks),
      "Les rulings Un quizz difficile sur les politiques de jeu."
    );
  });

  it("écarte ce qui ne se lit pas en une phrase", () => {
    const blocks = [markdown("![Illustration](https://joutes.app/i.png)\n\n```js\nconst x = 1;\n```\n\nEn selle.")];

    assert.equal(quizIntroDescription(blocks), "En selle.");
  });

  it("coupe au dernier mot entier et marque la coupure", () => {
    const long = `${"mot ".repeat(80)}fin`;
    const description = quizIntroDescription([markdown(long)]);

    assert.ok(description);
    assert.ok(description.length <= MAX_META_DESCRIPTION_LENGTH, `longueur : ${description.length}`);
    assert.ok(description.endsWith("…"), description);
    // La coupure ne laisse pas de mot à moitié : le dernier caractère avant les
    // points de suspension appartient à un mot entier.
    assert.ok(/mot…$/.test(description), description);
  });

  it("ne rend rien quand le quizz entre dans le vif du sujet", () => {
    // L'appelant retombe alors sur une phrase traduite, qui décrit au moins ce
    // qu'est un quizz.
    assert.equal(quizIntroDescription([form(), markdown("Bravo !")]), null);
    assert.equal(quizIntroDescription([markdown("   ")]), null);
    assert.equal(quizIntroDescription(undefined), null);
    assert.equal(quizIntroDescription([]), null);
  });
});
