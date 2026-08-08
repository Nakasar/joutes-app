import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gradeSection, isCorrect, questionsValidatedBy, toAnswerPayload } from "@/lib/quizzes/grade";
import type { QuizBlock, QuizQuestion } from "@/lib/types/Quiz";

/**
 * Correction d'un quizz côté serveur. Ce module décide du score enregistré sur
 * un profil : une question comptée juste à tort y reste.
 *
 * Exécution : `npm run test`.
 */

function question(overrides: Partial<QuizQuestion> & { id: string }): QuizQuestion {
  return { type: "single", prompt: "?", ...overrides };
}

function form(id: string, questions: QuizQuestion[], showSubmitButton = true): QuizBlock {
  return { id, type: "form", questions, showSubmitButton };
}

function markdown(id: string): QuizBlock {
  return { id, type: "markdown", content: "..." };
}

describe("isCorrect", () => {
  it("valide un choix unique sur le bon identifiant", () => {
    const q = question({ id: "q", type: "single", correctOptionIds: ["a"] });

    assert.equal(isCorrect(q, "a"), true);
    assert.equal(isCorrect(q, "b"), false);
    assert.equal(isCorrect(q, undefined), false);
  });

  it("exige exactement les bonnes cases pour un choix multiple", () => {
    const q = question({ id: "q", type: "multiple", correctOptionIds: ["a", "b"] });

    assert.equal(isCorrect(q, ["a", "b"]), true);
    assert.equal(isCorrect(q, ["b", "a"]), true, "l'ordre des cases ne compte pas");
    assert.equal(isCorrect(q, ["a"]), false, "une réponse incomplète est fausse");
    assert.equal(isCorrect(q, ["a", "b", "c"]), false, "une case en trop est fausse");
  });

  it("ne valide pas un choix multiple sans bonne réponse déclarée", () => {
    // Sans garde, ne rien cocher validerait la question.
    const q = question({ id: "q", type: "multiple", correctOptionIds: [] });

    assert.equal(isCorrect(q, []), false);
    assert.equal(isCorrect(q, undefined), false);
  });

  it("compare le texte sans casse ni espaces de bord", () => {
    const q = question({ id: "q", type: "text", correctText: " Annie " });

    assert.equal(isCorrect(q, "annie"), true);
    assert.equal(isCorrect(q, "  ANNIE  "), true);
    assert.equal(isCorrect(q, "anni"), false);
  });

  it("accepte un nombre envoyé comme chaîne", () => {
    // Le champ nombre conserve la saisie brute pour rester éditable : le client
    // envoie « 3 » là où 3 est attendu.
    const q = question({ id: "q", type: "number", correctNumber: 3 });

    assert.equal(isCorrect(q, 3), true);
    assert.equal(isCorrect(q, "3"), true);
    assert.equal(isCorrect(q, " 3 "), true);
    assert.equal(isCorrect(q, "3.0"), true);
    assert.equal(isCorrect(q, "trois"), false);
    assert.equal(isCorrect(q, ""), false);
  });

  it("ne valide rien quand la question n'attend aucune réponse", () => {
    assert.equal(isCorrect(question({ id: "q", type: "text" }), ""), false);
    assert.equal(isCorrect(question({ id: "q", type: "number" }), 0), false);
  });
});

describe("toAnswerPayload", () => {
  it("garde les réponses exploitables telles quelles", () => {
    assert.deepEqual(toAnswerPayload({ q1: "a", q2: ["a", "b"], q3: 3, q4: "" }), {
      q1: "a",
      q2: ["a", "b"],
      q3: 3,
      q4: "",
    });
  });

  it("écarte une question sans réponse", () => {
    assert.deepEqual(toAnswerPayload({ q1: "a", q2: undefined }), { q1: "a" });
  });

  it("écarte un nombre non fini", () => {
    // Une saisie incomplète laisse un `NaN` en état ; `JSON.stringify` le
    // tourne en `null`, que le schéma de l'API rejette — un 400 que personne
    // ne verrait passer.
    assert.deepEqual(toAnswerPayload({ q1: NaN, q2: Infinity, q3: 0 }), { q3: 0 });
  });
});

describe("questionsValidatedBy", () => {
  const blocks = [
    form("b0", [question({ id: "q1" })]),
    markdown("b1"),
    form("b2", [question({ id: "q2" })], false),
    form("b3", [question({ id: "q3" })]),
  ];

  it("prend les questions depuis le début pour le premier bouton", () => {
    assert.deepEqual(
      questionsValidatedBy(blocks, 0).map((q) => q.id),
      ["q1"]
    );
  });

  it("reprend au bouton précédent, sans recorriger la section déjà validée", () => {
    assert.deepEqual(
      questionsValidatedBy(blocks, 3).map((q) => q.id),
      ["q2", "q3"]
    );
  });
});

describe("gradeSection", () => {
  const blocks = [
    form("b0", [
      question({ id: "q1", correctOptionIds: ["a"] }),
      question({ id: "q2", correctOptionIds: ["b"] }),
    ]),
    form("b1", [question({ id: "q3", correctOptionIds: ["c"] })]),
  ];

  it("compte les bonnes réponses de la section", () => {
    const score = gradeSection({ blocks }, "b0", { q1: "a", q2: "zzz" });

    assert.deepEqual(score, {
      correct: 1,
      total: 2,
      resultsByQuestionId: { q1: true, q2: false },
    });
  });

  it("ne note que la section du bloc désigné", () => {
    const score = gradeSection({ blocks }, "b1", { q1: "a", q2: "b", q3: "c" });

    assert.deepEqual(score?.resultsByQuestionId, { q3: true });
    assert.equal(score?.total, 1);
  });

  it("compte une question sans réponse comme fausse plutôt que de l'ignorer", () => {
    const score = gradeSection({ blocks }, "b0", {});

    assert.equal(score?.correct, 0);
    assert.equal(score?.total, 2);
  });

  it("rend null pour un bloc inconnu", () => {
    // Un client qui aurait une autre version du quizz en mémoire noterait
    // sinon une section au hasard.
    assert.equal(gradeSection({ blocks }, "inexistant", {}), null);
  });

  it("rend null pour un bloc sans bouton de validation", () => {
    const sansBouton = [form("b0", [question({ id: "q1" })], false)];

    assert.equal(gradeSection({ blocks: sansBouton }, "b0", {}), null);
  });

  it("rend null pour un bloc de texte", () => {
    assert.equal(gradeSection({ blocks: [markdown("b0")] }, "b0", {}), null);
  });
});
