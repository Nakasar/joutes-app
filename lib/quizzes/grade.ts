import type { Quiz, QuizBlock, QuizQuestion } from "@/lib/types/Quiz";

/**
 * Correction d'un quizz.
 *
 * Le joueur est corrigé par son propre navigateur, pour avoir la réponse sans
 * attendre le réseau. Ce module sert le second usage : recorriger les mêmes
 * réponses côté serveur avant d'enregistrer un score. Un score simplement
 * déclaré par le client ne vaudrait rien — c'est le client qui le calcule, et
 * rien ne l'empêcherait d'en annoncer un autre.
 */

/** Réponse donnée à une question, selon son type. */
export type QuizAnswerValue = string | string[] | number | undefined;

/**
 * La saisie d'un champ nombre voyage telle que tapée : la convertir à chaque
 * frappe rendrait les états intermédiaires (« - », « 1. ») inéditables, si bien
 * que le client envoie parfois une chaîne là où un nombre est attendu.
 */
function toNumber(answer: QuizAnswerValue): number | null {
  if (typeof answer === "number") return Number.isFinite(answer) ? answer : null;
  if (typeof answer !== "string") return null;

  const trimmed = answer.trim();
  if (trimmed === "") return null;

  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Une réponse est juste ou fausse ; l'absence de réponse est fausse. */
export function isCorrect(question: QuizQuestion, answer: QuizAnswerValue): boolean {
  switch (question.type) {
    case "single": {
      const correct = question.correctOptionIds?.[0];
      return !!correct && answer === correct;
    }
    case "multiple": {
      const correctIds = question.correctOptionIds ?? [];
      const given = Array.isArray(answer) ? answer : [];
      // Une question sans bonne réponse déclarée ne peut pas être réussie :
      // sans ce garde, n'y pas répondre du tout la validerait.
      return (
        correctIds.length > 0 &&
        correctIds.length === given.length &&
        correctIds.every((id) => given.includes(id))
      );
    }
    case "text": {
      const expected = (question.correctText ?? "").trim().toLowerCase();
      const given = typeof answer === "string" ? answer.trim().toLowerCase() : "";
      return !!expected && given === expected;
    }
    case "number": {
      if (question.correctNumber === undefined) return false;
      const given = toNumber(answer);
      return given !== null && given === question.correctNumber;
    }
  }
}

/**
 * Questions corrigées par le bouton de validation du bloc `blockIndex` : celles
 * depuis le bouton précédent, et non tout le quizz depuis le début — un quizz
 * en plusieurs sections ne recorrige donc pas les sections déjà validées.
 */
export function questionsValidatedBy(blocks: QuizBlock[], blockIndex: number): QuizQuestion[] {
  let startIndex = 0;
  for (let i = blockIndex - 1; i >= 0; i--) {
    const previous = blocks[i];
    if (previous.type === "form" && previous.showSubmitButton) {
      startIndex = i + 1;
      break;
    }
  }

  const questions: QuizQuestion[] = [];
  for (let i = startIndex; i <= blockIndex; i++) {
    const block = blocks[i];
    if (block.type === "form") questions.push(...block.questions);
  }
  return questions;
}

export type SectionScore = {
  correct: number;
  total: number;
  /** Correction question par question, dans l'ordre où elles sont posées. */
  resultsByQuestionId: Record<string, boolean>;
};

/**
 * Note la section que termine le bloc `blockId`, d'après les réponses données.
 *
 * Le bloc est désigné par son identifiant plutôt que par son rang : un client
 * qui aurait une autre version du quizz en mémoire noterait sinon la mauvaise
 * section sans que rien ne le signale. Un identifiant inconnu, ou qui ne
 * désigne pas un bloc muni d'un bouton, rend `null` — il n'y a pas de section à
 * noter là.
 */
export function gradeSection(
  quiz: Pick<Quiz, "blocks">,
  blockId: string,
  answers: Record<string, QuizAnswerValue>
): SectionScore | null {
  const blockIndex = quiz.blocks.findIndex((block) => block.id === blockId);
  if (blockIndex === -1) return null;

  const block = quiz.blocks[blockIndex];
  if (block.type !== "form" || !block.showSubmitButton) return null;

  const questions = questionsValidatedBy(quiz.blocks, blockIndex);
  const resultsByQuestionId: Record<string, boolean> = {};
  let correct = 0;

  for (const question of questions) {
    const result = isCorrect(question, answers[question.id]);
    resultsByQuestionId[question.id] = result;
    if (result) correct += 1;
  }

  return { correct, total: questions.length, resultsByQuestionId };
}
