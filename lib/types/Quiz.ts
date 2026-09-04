import type { Locale } from "@/i18n/config";

export type QuizQuestionType = "single" | "multiple" | "text" | "number";

export type QuizQuestionOption = {
  id: string;
  text: string;
};

export type QuizQuestion = {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  /** "single" and "multiple" only. */
  options?: QuizQuestionOption[];
  /** "single" (exactly one id) and "multiple" (one or more ids) only. */
  correctOptionIds?: string[];
  /** "text" only — compared case-insensitively, trimmed. */
  correctText?: string;
  /** "number" only. */
  correctNumber?: number;
  correctFeedback?: string;
  incorrectFeedback?: string;
};

export type QuizMarkdownBlock = {
  id: string;
  type: "markdown";
  content: string;
};

export type QuizFormBlock = {
  id: string;
  type: "form";
  questions: QuizQuestion[];
  /** Whether this block ends with a button that checks every question up to and including this block. */
  showSubmitButton: boolean;
};

export type QuizBlock = QuizMarkdownBlock | QuizFormBlock;

/**
 * Textes traduits d'un bloc, d'une question ou d'une proposition. Les champs
 * repris sont ceux du nœud désigné : `content` pour un bloc de texte, `text`
 * pour une proposition, le reste pour une question.
 */
export type QuizTranslationEntry = {
  content?: string;
  prompt?: string;
  text?: string;
  correctText?: string;
  correctFeedback?: string;
  incorrectFeedback?: string;
};

export type QuizTranslationInput = {
  lang: Locale;
  title: string;
  /**
   * Traductions indexées par l'identifiant du bloc, de la question ou de la
   * proposition — et non par leur position. Réordonner ou insérer un bloc ne
   * déplace donc aucune traduction, et retirer un bloc laisse une entrée
   * orpheline, simplement ignorée à l'affichage.
   */
  entries: Record<string, QuizTranslationEntry>;
};

export type QuizTranslation = QuizTranslationInput & {
  updatedAt: Date;
};

export type Quiz = {
  id: string;
  title: string;
  gameId?: string;
  game?: { id: string; name: string; slug?: string; icon?: string };
  /** Image de couverture déposée par l'auteur. Prime sur la carte désignée. */
  coverImageUrl?: string;
  /** Carte du jeu choisie pour illustrer le quizz. */
  coverCardId?: string;
  /** Adresse de la couverture effectivement affichée — dérivée à l'enregistrement. */
  coverImage?: string;
  blocks: QuizBlock[];
  /** Langue dans laquelle le quizz a été écrit : la « VO ». */
  originalLang: Locale;
  translations?: QuizTranslation[];
  authorId: string;
  author?: { id: string; displayName?: string; discriminator?: string };
  createdAt: Date;
  /** Dernière modification du contenu. Les traductions n'y touchent pas : c'est ce qui permet de repérer celles devenues obsolètes. */
  updatedAt: Date;
};
