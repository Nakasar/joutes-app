import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quizContentTexts } from "@/lib/quizzes/content";
import type { Quiz } from "@/lib/types/Quiz";

/**
 * Ce que la résolution des mentions de cartes voit d'un quizz. Un champ oublié
 * ici, et la carte qu'il mentionne reste du texte brut à l'écran — d'où des
 * tests qui énumèrent les champs plutôt que de vérifier un simple compte.
 *
 * Exécution : `npm run test`.
 */

function quiz(blocks: Quiz["blocks"], translations?: Quiz["translations"]): Pick<Quiz, "blocks" | "translations"> {
  return { blocks, translations };
}

describe("quizContentTexts", () => {
  it("prend le contenu d'un bloc de texte", () => {
    const texts = quizContentTexts(quiz([{ id: "b1", type: "markdown", content: "Voir [Annie]" }]));

    assert.deepEqual(texts, ["Voir [Annie]"]);
  });

  it("prend l'énoncé, les propositions et les deux corrections d'une question", () => {
    const texts = quizContentTexts(
      quiz([
        {
          id: "b1",
          type: "form",
          showSubmitButton: true,
          questions: [
            {
              id: "q1",
              type: "single",
              prompt: "Que fait [Annie] ?",
              options: [
                { id: "o1", text: "Elle joue [Tibbers]" },
                { id: "o2", text: "Rien" },
              ],
              correctFeedback: "Oui, comme [Tibbers]",
              incorrectFeedback: "Non, relis [Annie]",
            },
          ],
        },
      ])
    );

    assert.deepEqual(texts, [
      "Que fait [Annie] ?",
      "Elle joue [Tibbers]",
      "Rien",
      "Oui, comme [Tibbers]",
      "Non, relis [Annie]",
    ]);
  });

  it("prend les textes traduits, qu'aucun aller-retour ne rechargera", () => {
    const texts = quizContentTexts(
      quiz([{ id: "b1", type: "markdown", content: "Voir [Annie]" }], [
        {
          lang: "it",
          title: "Quiz",
          updatedAt: new Date(),
          entries: { b1: { content: "Vedi [Tibbers]" } },
        },
      ])
    );

    assert.ok(texts.includes("Vedi [Tibbers]"));
  });

  it("écarte les champs vides plutôt que de les faire résoudre", () => {
    const texts = quizContentTexts(
      quiz([
        {
          id: "b1",
          type: "form",
          showSubmitButton: false,
          questions: [{ id: "q1", type: "text", prompt: "Nom ?" }],
        },
      ])
    );

    assert.deepEqual(texts, ["Nom ?"]);
  });

  it("ne bronche pas sur un quizz sans bloc ni traduction", () => {
    assert.deepEqual(quizContentTexts(quiz([])), []);
  });
});
