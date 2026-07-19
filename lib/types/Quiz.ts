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

export type Quiz = {
  id: string;
  title: string;
  gameId?: string;
  game?: { id: string; name: string; slug?: string; icon?: string };
  blocks: QuizBlock[];
  authorId: string;
  author?: { id: string; displayName?: string; discriminator?: string };
  createdAt: Date;
  updatedAt: Date;
};
