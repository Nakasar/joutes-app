import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  availableQuizLangs,
  collectTranslatableSections,
  isTranslationStale,
  localizeQuiz,
  mergeTranslationEntries,
  translationProgress,
} from "./translate";
import type { QuizBlock } from "@/lib/types/Quiz";

/**
 * Traduction d'un quizz : les textes traduits sont rangés sous l'identifiant du
 * nœud qu'ils traduisent, pour survivre à un réordonnancement des blocs, et le
 * repli se fait champ par champ.
 *
 * Exécution : `npm run test`.
 */

const blocks: QuizBlock[] = [
  { id: "b1", type: "markdown", content: "Contexte de la règle." },
  {
    id: "b2",
    type: "form",
    showSubmitButton: true,
    questions: [
      {
        id: "q1",
        type: "single",
        prompt: "L'adversaire pioche-t-il ?",
        options: [
          { id: "o1", text: "Oui" },
          { id: "o2", text: "Non" },
        ],
        correctOptionIds: ["o2"],
        correctFeedback: "Bien vu.",
      },
      {
        id: "q2",
        type: "text",
        prompt: "Quelle règle ?",
        correctText: "trois cent cinquante-neuf",
      },
    ],
  },
];

const quiz = {
  title: "Questions de règles",
  blocks,
  originalLang: "fr" as const,
  translations: [
    {
      lang: "en" as const,
      title: "Rules questions",
      updatedAt: new Date("2026-01-02"),
      entries: {
        b1: { content: "Rule context." },
        q1: { prompt: "Does the opponent draw?", correctFeedback: "Well spotted." },
        o1: { text: "Yes" },
        o2: { text: "No" },
        q2: { prompt: "Which rule?", correctText: "three hundred fifty-nine" },
      },
    },
  ],
};

describe("collectTranslatableSections", () => {
  it("recense les textes dans l'ordre de lecture, une section par question", () => {
    const sections = collectTranslatableSections(blocks);

    assert.deepEqual(
      sections.map((section) => [section.blockIndex, section.questionIndex]),
      [
        [0, undefined],
        [1, 0],
        [1, 1],
      ]
    );
    assert.deepEqual(
      sections[1].fields.map((field) => [field.id, field.entryField]),
      [
        ["q1", "prompt"],
        ["o1", "text"],
        ["o2", "text"],
        ["q1", "correctFeedback"],
      ]
    );
  });

  it("propose la réponse attendue d'une question libre", () => {
    // Jouer le quizz dans une autre langue suppose de pouvoir y répondre.
    const sections = collectTranslatableSections(blocks);
    const fields = sections[2].fields.map((field) => field.entryField);

    assert.deepEqual(fields, ["prompt", "correctText"]);
  });

  it("ne propose pas les explications absentes", () => {
    const sections = collectTranslatableSections([
      {
        id: "b",
        type: "form",
        showSubmitButton: true,
        questions: [{ id: "q", type: "number", prompt: "Combien ?", correctNumber: 2 }],
      },
    ]);

    assert.deepEqual(
      sections[0].fields.map((field) => field.entryField),
      ["prompt"]
    );
  });
});

describe("localizeQuiz", () => {
  it("rend le quizz dans la langue demandée", () => {
    const localized = localizeQuiz(quiz, "en");

    assert.equal(localized.title, "Rules questions");
    const [markdown, form] = localized.blocks;
    assert.equal(markdown.type === "markdown" && markdown.content, "Rule context.");
    assert.ok(form.type === "form");
    assert.equal(form.questions[0].prompt, "Does the opponent draw?");
    assert.deepEqual(
      form.questions[0].options?.map((option) => option.text),
      ["Yes", "No"]
    );
    assert.equal(form.questions[0].correctFeedback, "Well spotted.");
    assert.equal(form.questions[1].correctText, "three hundred fifty-nine");
  });

  it("laisse le quizz intact dans sa langue d'origine", () => {
    assert.equal(localizeQuiz(quiz, "fr"), quiz);
  });

  it("laisse le quizz intact pour une langue sans traduction", () => {
    assert.equal(localizeQuiz(quiz, "de"), quiz);
  });

  it("retombe champ par champ sur la version originale", () => {
    // Une traduction commencée montre ce qui est traduit, le reste en VO.
    const partial = {
      ...quiz,
      translations: [
        {
          lang: "it" as const,
          title: "",
          updatedAt: new Date("2026-01-02"),
          entries: { q1: { prompt: "L'avversario pesca?" }, o1: { text: "   " } },
        },
      ],
    };

    const localized = localizeQuiz(partial, "it");
    assert.equal(localized.title, "Questions de règles");
    const form = localized.blocks[1];
    assert.ok(form.type === "form");
    assert.equal(form.questions[0].prompt, "L'avversario pesca?");
    // Traduction vide ou blanche : on garde l'original plutôt qu'un trou.
    assert.equal(form.questions[0].options?.[0].text, "Oui");
    assert.equal(form.questions[1].prompt, "Quelle règle ?");
  });

  it("suit les blocs réordonnés, les traductions étant rangées par identifiant", () => {
    const reordered = { ...quiz, blocks: [blocks[1], blocks[0]] };
    const localized = localizeQuiz(reordered, "en");

    assert.equal(localized.blocks[1].type === "markdown" && localized.blocks[1].content, "Rule context.");
  });

  it("ignore une entrée dont le bloc a disparu", () => {
    const shortened = { ...quiz, blocks: [blocks[0]] };
    const localized = localizeQuiz(shortened, "en");

    assert.equal(localized.blocks.length, 1);
    assert.equal(localized.blocks[0].type === "markdown" && localized.blocks[0].content, "Rule context.");
  });
});

describe("mergeTranslationEntries", () => {
  it("conserve les entrées dont le bloc a disparu du quizz", () => {
    // L'éditeur ne montre que les textes du quizz actuel : ré-enregistrer ne
    // doit pas effacer une traduction devenue orpheline, qui resservira si le
    // bloc revient.
    const merged = mergeTranslationEntries(
      { b1: { content: "Rule context." }, disparu: { prompt: "Old question" } },
      [{ id: "b1", entryField: "content", value: "New context." }]
    );

    assert.deepEqual(merged, {
      b1: { content: "New context." },
      disparu: { prompt: "Old question" },
    });
  });

  it("conserve les champs d'un nœud qui ne sont plus éditables", () => {
    // Une question passée de « réponse libre » à « choix unique » n'expose plus
    // sa réponse attendue : elle n'est pas pour autant à jeter.
    const merged = mergeTranslationEntries(
      { q1: { prompt: "Which rule?", correctText: "three fifty-nine" } },
      [{ id: "q1", entryField: "prompt", value: "Which rule applies?" }]
    );

    assert.deepEqual(merged, { q1: { prompt: "Which rule applies?", correctText: "three fifty-nine" } });
  });

  it("retire un champ vidé dans l'éditeur", () => {
    const merged = mergeTranslationEntries({ q1: { prompt: "Question", correctFeedback: "Bien" } }, [
      { id: "q1", entryField: "prompt", value: "   " },
    ]);

    assert.deepEqual(merged, { q1: { correctFeedback: "Bien" } });
  });

  it("retire l'entrée quand son dernier champ est vidé", () => {
    assert.deepEqual(
      mergeTranslationEntries({ b1: { content: "Rule context." } }, [
        { id: "b1", entryField: "content", value: "" },
      ]),
      {}
    );
  });

  it("ne modifie pas les entrées reçues", () => {
    const previous = { b1: { content: "Rule context." } };
    mergeTranslationEntries(previous, [{ id: "b1", entryField: "content", value: "New." }]);

    assert.deepEqual(previous, { b1: { content: "Rule context." } });
  });
});

describe("availableQuizLangs", () => {
  it("donne la langue d'origine puis les traductions, sans doublon", () => {
    assert.deepEqual(availableQuizLangs(quiz), ["fr", "en"]);
    assert.deepEqual(availableQuizLangs({ originalLang: "en", translations: [] }), ["en"]);
  });
});

describe("isTranslationStale", () => {
  it("repère une traduction antérieure à la dernière modification du contenu", () => {
    const translation = quiz.translations[0];

    assert.equal(isTranslationStale(translation, new Date("2026-01-03")), true);
    assert.equal(isTranslationStale(translation, new Date("2026-01-01")), false);
  });
});

describe("translationProgress", () => {
  // 7 textes : le bloc de texte, puis pour q1 l'énoncé, ses deux propositions
  // et son explication, et pour q2 l'énoncé et sa réponse attendue.
  it("compte les textes effectivement traduits", () => {
    assert.deepEqual(translationProgress(blocks, quiz.translations[0].entries), { done: 7, total: 7 });
    assert.deepEqual(translationProgress(blocks, { b1: { content: "Rule context." } }), { done: 1, total: 7 });
    assert.deepEqual(translationProgress(blocks, undefined), { done: 0, total: 7 });
  });

  it("ne compte pas une traduction blanche", () => {
    assert.deepEqual(translationProgress(blocks, { b1: { content: "   " } }), { done: 0, total: 7 });
  });
});
