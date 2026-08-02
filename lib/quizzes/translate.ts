import type {
  Quiz,
  QuizBlock,
  QuizQuestion,
  QuizTranslation,
  QuizTranslationEntry,
} from "@/lib/types/Quiz";
import type { Locale } from "@/i18n/config";

/**
 * Traduction d'un quizz.
 *
 * Le contenu d'un quizz est structuré — des blocs, des questions, des
 * propositions — et non un texte d'un seul tenant comme une politique ou un
 * errata. Une traduction ne recopie donc pas la structure : elle range ses
 * textes sous l'identifiant du nœud qu'ils traduisent. Réordonner les blocs ne
 * déplace aucune traduction, et en retirer un laisse une entrée orpheline,
 * ignorée à l'affichage.
 *
 * Le repli se fait champ par champ : une traduction commencée mais incomplète
 * montre ce qui est traduit et laisse le reste en version originale, plutôt que
 * de tout renvoyer en VO.
 */

/** Nature d'un texte traduisible, pour que l'éditeur sache comment l'annoncer et le saisir. */
export type QuizFieldKind =
  | "blockContent"
  | "prompt"
  | "option"
  | "correctText"
  | "correctFeedback"
  | "incorrectFeedback";

export type QuizTranslatableField = {
  /** Identifiant du bloc, de la question ou de la proposition traduite. */
  id: string;
  /** Champ correspondant dans l'entrée de traduction. */
  entryField: keyof QuizTranslationEntry;
  kind: QuizFieldKind;
  /** Texte d'origine, montré en colonne de gauche. */
  source: string;
  /** Rang de la proposition, pour les libellés de l'éditeur. */
  optionIndex?: number;
};

/** Un bloc, ou une question d'un bloc formulaire : de quoi grouper les lignes de l'éditeur. */
export type QuizTranslatableSection = {
  blockIndex: number;
  /** Absent sur un bloc de texte. */
  questionIndex?: number;
  fields: QuizTranslatableField[];
};

function questionFields(question: QuizQuestion): QuizTranslatableField[] {
  const fields: QuizTranslatableField[] = [
    { id: question.id, entryField: "prompt", kind: "prompt", source: question.prompt },
  ];

  (question.options ?? []).forEach((option, optionIndex) => {
    fields.push({
      id: option.id,
      entryField: "text",
      kind: "option",
      source: option.text,
      optionIndex,
    });
  });

  // La réponse attendue d'une question libre est comparée à la saisie du
  // joueur : jouer le quizz en italien suppose de pouvoir répondre en italien.
  if (question.type === "text" && question.correctText) {
    fields.push({
      id: question.id,
      entryField: "correctText",
      kind: "correctText",
      source: question.correctText,
    });
  }

  if (question.correctFeedback) {
    fields.push({
      id: question.id,
      entryField: "correctFeedback",
      kind: "correctFeedback",
      source: question.correctFeedback,
    });
  }
  if (question.incorrectFeedback) {
    fields.push({
      id: question.id,
      entryField: "incorrectFeedback",
      kind: "incorrectFeedback",
      source: question.incorrectFeedback,
    });
  }

  return fields;
}

/** Tout ce qu'il y a à traduire dans un quizz, dans l'ordre de lecture. */
export function collectTranslatableSections(blocks: QuizBlock[]): QuizTranslatableSection[] {
  const sections: QuizTranslatableSection[] = [];

  blocks.forEach((block, blockIndex) => {
    if (block.type === "markdown") {
      sections.push({
        blockIndex,
        fields: [
          { id: block.id, entryField: "content", kind: "blockContent", source: block.content },
        ],
      });
      return;
    }

    block.questions.forEach((question, questionIndex) => {
      sections.push({ blockIndex, questionIndex, fields: questionFields(question) });
    });
  });

  return sections;
}

/** Texte traduit s'il existe et n'est pas vide, sinon l'original. */
function pick(
  entries: Record<string, QuizTranslationEntry>,
  id: string,
  field: keyof QuizTranslationEntry,
  original: string
): string {
  return entries[id]?.[field]?.trim() || original;
}

function localizeBlock(block: QuizBlock, entries: Record<string, QuizTranslationEntry>): QuizBlock {
  if (block.type === "markdown") {
    return { ...block, content: pick(entries, block.id, "content", block.content) };
  }

  return {
    ...block,
    questions: block.questions.map((question) => ({
      ...question,
      prompt: pick(entries, question.id, "prompt", question.prompt),
      ...(question.options
        ? { options: question.options.map((option) => ({ ...option, text: pick(entries, option.id, "text", option.text) })) }
        : {}),
      ...(question.correctText !== undefined
        ? { correctText: pick(entries, question.id, "correctText", question.correctText) }
        : {}),
      ...(question.correctFeedback !== undefined
        ? { correctFeedback: pick(entries, question.id, "correctFeedback", question.correctFeedback) }
        : {}),
      ...(question.incorrectFeedback !== undefined
        ? { incorrectFeedback: pick(entries, question.id, "incorrectFeedback", question.incorrectFeedback) }
        : {}),
    })),
  };
}

/** Langues dans lesquelles le quizz peut être lu : sa VO, puis ses traductions. */
export function availableQuizLangs(quiz: Pick<Quiz, "originalLang" | "translations">): Locale[] {
  return [...new Set([quiz.originalLang, ...(quiz.translations ?? []).map((tr) => tr.lang)])];
}

/**
 * Quizz tel qu'il se lit dans une langue. La langue d'origine — ou une langue
 * sans traduction — rend le quizz inchangé.
 */
export function localizeQuiz<T extends Pick<Quiz, "title" | "blocks" | "originalLang" | "translations">>(
  quiz: T,
  lang: Locale
): T {
  if (lang === quiz.originalLang) {
    return quiz;
  }

  const translation = quiz.translations?.find((tr) => tr.lang === lang);
  if (!translation) {
    return quiz;
  }

  const entries = translation.entries ?? {};
  return {
    ...quiz,
    title: translation.title?.trim() || quiz.title,
    blocks: quiz.blocks.map((block) => localizeBlock(block, entries)),
  };
}

/**
 * Une traduction est obsolète quand le contenu a changé après elle. Les
 * traductions ne touchant pas à `updatedAt`, la comparaison ne retient que les
 * modifications du quizz lui-même.
 */
export function isTranslationStale(translation: QuizTranslation, contentUpdatedAt: Date): boolean {
  return new Date(translation.updatedAt) < new Date(contentUpdatedAt);
}

/** Un texte saisi dans l'éditeur, rattaché au nœud qu'il traduit. */
export type EditedTranslationField = {
  id: string;
  entryField: keyof QuizTranslationEntry;
  value: string;
};

/**
 * Traduction à enregistrer : la saisie de l'éditeur posée sur les entrées déjà
 * en base.
 *
 * Repartir des entrées existantes n'est pas une précaution de style. L'éditeur
 * ne montre que les textes du quizz *actuel* : une entrée dont le bloc a été
 * retiré n'y figure pas, et reconstruire la traduction à partir du seul
 * formulaire l'effacerait — alors que tout le modèle repose sur le fait qu'elle
 * survit et redevient utile si le bloc revient.
 *
 * Un champ vidé dans l'éditeur est bien retiré : seul ce qui n'était pas
 * éditable est reconduit tel quel.
 */
export function mergeTranslationEntries(
  previous: Record<string, QuizTranslationEntry> | undefined,
  edited: EditedTranslationField[]
): Record<string, QuizTranslationEntry> {
  const entries: Record<string, QuizTranslationEntry> = Object.fromEntries(
    Object.entries(previous ?? {}).map(([id, entry]) => [id, { ...entry }])
  );

  for (const { id, entryField, value } of edited) {
    const entry = { ...(entries[id] ?? {}) };
    const trimmed = value.trim();

    if (trimmed) {
      entry[entryField] = trimmed;
    } else {
      delete entry[entryField];
    }

    if (Object.keys(entry).length > 0) {
      entries[id] = entry;
    } else {
      delete entries[id];
    }
  }

  return entries;
}

/** Part des textes effectivement traduits, pour annoncer l'avancement d'une langue. */
export function translationProgress(
  blocks: QuizBlock[],
  entries: Record<string, QuizTranslationEntry> | undefined
): { done: number; total: number } {
  const fields = collectTranslatableSections(blocks).flatMap((section) => section.fields);
  const done = fields.filter((field) => entries?.[field.id]?.[field.entryField]?.trim()).length;

  return { done, total: fields.length };
}
