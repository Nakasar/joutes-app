import { nanoid } from "nanoid";
import type { QuizBlock, QuizQuestion, QuizQuestionType } from "@/lib/types/Quiz";

/**
 * Conversion de la sortie du modèle en blocs de quizz.
 *
 * Le modèle ne produit ni identifiants ni références croisées : il désigne les
 * bonnes réponses par leur rang dans la liste des propositions. Tout le reste —
 * identifiants, bornes du schéma, cohérence entre le type de question et ses
 * champs — est rétabli ici, pour qu'un import donne toujours un brouillon que
 * le formulaire et l'API de création acceptent.
 *
 * Une question qu'on ne peut pas rendre valide est écartée plutôt que réparée
 * au jugé : mieux vaut un brouillon plus court qu'une question fausse glissée
 * au milieu des bonnes.
 */

/** Question telle que le modèle la rend. */
export type ImportedQuestion = {
  type: QuizQuestionType;
  prompt: string;
  /** Propositions, pour les questions à choix. */
  options?: string[] | null;
  /** Rangs (à partir de 0) des bonnes propositions. */
  correctOptionIndexes?: number[] | null;
  correctText?: string | null;
  correctNumber?: number | null;
  correctFeedback?: string | null;
  incorrectFeedback?: string | null;
};

export type ImportedBlock = {
  type: "markdown" | "form";
  /** Blocs `markdown` uniquement. */
  content?: string | null;
  /** Blocs `form` uniquement. */
  questions?: ImportedQuestion[] | null;
};

export type ImportedQuiz = {
  title: string;
  blocks: ImportedBlock[];
};

/** Bornes de `lib/schemas/quiz.schema.ts` : le brouillon doit s'y tenir. */
const LIMITS = {
  title: 200,
  prompt: 1000,
  optionText: 300,
  correctText: 300,
  feedback: 2000,
  options: 20,
} as const;

function trimmed(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * Borne un texte déjà annoté. La coupe ne doit pas tomber au milieu d'une
 * mention : un crochet resté ouvert s'afficherait tel quel dans le quizz.
 */
function bound(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }

  const cut = value.slice(0, max);
  const lastOpen = cut.lastIndexOf("[");
  const lastClose = cut.lastIndexOf("]");
  return (lastOpen > lastClose ? cut.slice(0, lastOpen) : cut).trimEnd();
}

export type AnnotateText = (text: string) => string;

/**
 * Texte affiché dans le quizz : annoté, puis borné. L'ordre compte — les
 * crochets ajoutés autour des noms de cartes allongent le texte, et borner
 * avant l'annotation laisserait passer des champs au-delà des limites du
 * schéma, donc un brouillon refusé à la publication.
 */
function display(value: string | null | undefined, max: number, annotate: AnnotateText): string {
  return bound(annotate(trimmed(value)), max);
}

function normalizeQuestion(
  question: ImportedQuestion,
  annotate: AnnotateText,
  makeId: () => string
): QuizQuestion | null {
  const prompt = display(question.prompt, LIMITS.prompt, annotate);
  if (!prompt) {
    return null;
  }

  const base = {
    id: makeId(),
    prompt,
    correctFeedback: display(question.correctFeedback, LIMITS.feedback, annotate) || undefined,
    incorrectFeedback: display(question.incorrectFeedback, LIMITS.feedback, annotate) || undefined,
  };

  if (question.type === "single" || question.type === "multiple") {
    const options = (question.options ?? [])
      .map((text) => trimmed(text))
      .filter(Boolean)
      .slice(0, LIMITS.options)
      .map((text) => ({ id: makeId(), text: bound(annotate(text), LIMITS.optionText) }));

    // Une question à choix sans alternative n'en est pas une.
    if (options.length < 2) {
      return null;
    }

    const indexes = [...new Set(question.correctOptionIndexes ?? [])].filter(
      (index) => Number.isInteger(index) && index >= 0 && index < options.length
    );
    if (indexes.length === 0) {
      return null;
    }

    // Un choix unique n'admet qu'une bonne réponse : le premier rang cité fait foi.
    const kept = question.type === "single" ? indexes.slice(0, 1) : indexes;

    return {
      ...base,
      type: question.type,
      options,
      correctOptionIds: kept.map((index) => options[index].id),
    };
  }

  if (question.type === "number") {
    const value = question.correctNumber;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    return { ...base, type: "number", correctNumber: value };
  }

  // Réponse libre : comparée telle quelle à la saisie du joueur, elle n'est
  // donc jamais annotée — des crochets y rendraient la bonne réponse
  // impossible à saisir.
  const correctText = bound(trimmed(question.correctText), LIMITS.correctText);
  if (!correctText) {
    return null;
  }
  return { ...base, type: "text", correctText };
}

/**
 * Blocs prêts pour le formulaire. `annotate` reçoit chaque texte affiché en
 * markdown — c'est là que les noms de cartes sont mis entre crochets.
 */
export function toQuizBlocks(
  blocks: ImportedBlock[],
  options: { annotate?: AnnotateText; makeId?: () => string } = {}
): QuizBlock[] {
  const annotate = options.annotate ?? ((text: string) => text);
  const makeId = options.makeId ?? (() => nanoid());

  const result: QuizBlock[] = [];

  for (const block of blocks ?? []) {
    if (block.type === "markdown") {
      const content = annotate((block.content ?? "").trim());
      if (content) {
        result.push({ id: makeId(), type: "markdown", content });
      }
      continue;
    }

    if (block.type === "form") {
      const questions = (block.questions ?? [])
        .map((question) => normalizeQuestion(question, annotate, makeId))
        .filter((question): question is QuizQuestion => question !== null);

      if (questions.length > 0) {
        result.push({ id: makeId(), type: "form", questions, showSubmitButton: true });
      }
    }
  }

  return result;
}

/** Titre du brouillon, borné comme celui du formulaire. */
export function toQuizTitle(title: string): string {
  return bound(trimmed(title), LIMITS.title);
}
