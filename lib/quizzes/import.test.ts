import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toQuizBlocks, toQuizTitle, type ImportedBlock } from "./import";

/**
 * Normalisation de la sortie du modèle pour l'import d'un quizz depuis un
 * texte : ce qui en sort doit toujours satisfaire `lib/schemas/quiz.schema.ts`,
 * sans quoi le brouillon serait refusé à la publication.
 *
 * Exécution : `npm run test`.
 */

/** Identifiants prévisibles, pour comparer des blocs entiers. */
function counter() {
  let next = 0;
  return () => `id${++next}`;
}

describe("toQuizBlocks", () => {
  it("convertit un bloc de texte et une question à choix unique", () => {
    const blocks: ImportedBlock[] = [
      { type: "markdown", content: "  Contexte de la règle.  " },
      {
        type: "form",
        questions: [
          {
            type: "single",
            prompt: "L'adversaire pioche-t-il 2 cartes ?",
            options: ["Oui", "Non"],
            correctOptionIndexes: [1],
            correctFeedback: "Bien vu.",
          },
        ],
      },
    ];

    assert.deepEqual(toQuizBlocks(blocks, { makeId: counter() }), [
      { id: "id1", type: "markdown", content: "Contexte de la règle." },
      {
        id: "id5",
        type: "form",
        showSubmitButton: true,
        questions: [
          {
            id: "id2",
            prompt: "L'adversaire pioche-t-il 2 cartes ?",
            correctFeedback: "Bien vu.",
            incorrectFeedback: undefined,
            type: "single",
            options: [
              { id: "id3", text: "Oui" },
              { id: "id4", text: "Non" },
            ],
            correctOptionIds: ["id4"],
          },
        ],
      },
    ]);
  });

  it("met les noms de cartes entre crochets dans les textes affichés", () => {
    const annotate = (text: string) => text.replaceAll("Hidden Blade", "[Hidden Blade]");
    const blocks: ImportedBlock[] = [
      { type: "markdown", content: "Je joue Hidden Blade." },
      {
        type: "form",
        questions: [
          {
            type: "single",
            prompt: "Hidden Blade se déclenche-t-elle ?",
            options: ["Oui, Hidden Blade fonctionne", "Non"],
            correctOptionIndexes: [0],
            incorrectFeedback: "Relis Hidden Blade.",
          },
        ],
      },
    ];

    const [markdown, form] = toQuizBlocks(blocks, { annotate, makeId: counter() });
    assert.equal(markdown.type === "markdown" && markdown.content, "Je joue [Hidden Blade].");
    assert.ok(form.type === "form");
    assert.equal(form.questions[0].prompt, "[Hidden Blade] se déclenche-t-elle ?");
    assert.equal(form.questions[0].options?.[0].text, "Oui, [Hidden Blade] fonctionne");
    assert.equal(form.questions[0].incorrectFeedback, "Relis [Hidden Blade].");
  });

  it("n'annote jamais la réponse attendue d'une question libre", () => {
    // Elle est comparée telle quelle à la saisie du joueur : des crochets la
    // rendraient impossible à trouver.
    const annotate = (text: string) => text.replaceAll("Abandon", "[Abandon]");
    const [block] = toQuizBlocks(
      [{ type: "form", questions: [{ type: "text", prompt: "Quelle carte ?", correctText: "Abandon" }] }],
      { annotate, makeId: counter() }
    );

    assert.ok(block.type === "form");
    assert.equal(block.questions[0].prompt, "Quelle carte ?");
    assert.equal(block.questions[0].correctText, "Abandon");
  });

  it("ne garde qu'une bonne réponse sur un choix unique", () => {
    const [block] = toQuizBlocks(
      [
        {
          type: "form",
          questions: [
            {
              type: "single",
              prompt: "Question",
              options: ["A", "B", "C"],
              correctOptionIndexes: [2, 0],
            },
          ],
        },
      ],
      { makeId: counter() }
    );

    assert.ok(block.type === "form");
    assert.deepEqual(block.questions[0].correctOptionIds, ["id4"]);
  });

  it("écarte les rangs de bonne réponse hors de la liste", () => {
    const [block] = toQuizBlocks(
      [
        {
          type: "form",
          questions: [
            {
              type: "multiple",
              prompt: "Question",
              options: ["A", "B"],
              correctOptionIndexes: [0, 7, -1, 0],
            },
          ],
        },
      ],
      { makeId: counter() }
    );

    assert.ok(block.type === "form");
    assert.deepEqual(block.questions[0].correctOptionIds, ["id2"]);
  });

  it("écarte les questions qu'on ne peut pas rendre valides", () => {
    const blocks: ImportedBlock[] = [
      {
        type: "form",
        questions: [
          // Sans alternative.
          { type: "single", prompt: "Une seule proposition", options: ["Oui"], correctOptionIndexes: [0] },
          // Aucune bonne réponse désignée.
          { type: "multiple", prompt: "Sans réponse", options: ["A", "B"], correctOptionIndexes: [] },
          // Réponse attendue absente.
          { type: "number", prompt: "Combien ?", correctNumber: null },
          { type: "text", prompt: "Quoi ?", correctText: "   " },
          // Énoncé vide.
          { type: "single", prompt: "  ", options: ["A", "B"], correctOptionIndexes: [0] },
        ],
      },
    ];

    // Aucune question ne survit : le bloc lui-même disparaît.
    assert.deepEqual(toQuizBlocks(blocks, { makeId: counter() }), []);
  });

  it("ignore un bloc de texte vide", () => {
    assert.deepEqual(toQuizBlocks([{ type: "markdown", content: "   " }], { makeId: counter() }), []);
  });

  it("borne les textes aux limites du schéma", () => {
    const [block] = toQuizBlocks(
      [
        {
          type: "form",
          questions: [
            {
              type: "single",
              prompt: "P".repeat(1200),
              options: ["A".repeat(400), "B"],
              correctOptionIndexes: [0],
              correctFeedback: "F".repeat(2500),
            },
          ],
        },
      ],
      { makeId: counter() }
    );

    assert.ok(block.type === "form");
    assert.equal(block.questions[0].prompt.length, 1000);
    assert.equal(block.questions[0].options?.[0].text.length, 300);
    assert.equal(block.questions[0].correctFeedback?.length, 2000);
  });

  it("ne garde que 20 propositions au maximum", () => {
    const [block] = toQuizBlocks(
      [
        {
          type: "form",
          questions: [
            {
              type: "multiple",
              prompt: "Question",
              options: Array.from({ length: 30 }, (_, index) => `Option ${index}`),
              correctOptionIndexes: [0],
            },
          ],
        },
      ],
      { makeId: counter() }
    );

    assert.ok(block.type === "form");
    assert.equal(block.questions[0].options?.length, 20);
  });
});

describe("toQuizTitle", () => {
  it("nettoie et borne le titre", () => {
    assert.equal(toQuizTitle("  Questions de règles  "), "Questions de règles");
    assert.equal(toQuizTitle("T".repeat(300)).length, 200);
  });
});
