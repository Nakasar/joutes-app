import { jsonSchema, zodSchema, type Schema } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { QuizBlock, QuizQuestion } from "@/lib/types/Quiz";

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

/**
 * Ce qu'on accepte du modèle. Pas d'identifiants ni de références croisées :
 * les bonnes réponses sont désignées par leur rang, tout le reste est rétabli
 * par `toQuizBlocks`.
 *
 * **Tout y est facultatif, à dessein.** Le SDK envoie le schéma avec
 * `strict: false` (le défaut de `@ai-sdk/openai`) : le fournisseur le traite
 * comme une indication, pas comme un contrat, et le modèle omet des clés —
 * `questions` sur un bloc de texte, par exemple. Refuser tout l'import pour
 * autant ferait perdre un texte entier sur un champ absent. Ce qui est
 * inexploitable est écarté plus loin, question par question, là où on peut le
 * dire à l'utilisateur.
 *
 * **Aucun mot-clé de validation en dehors du type.** Les sorties structurées
 * d'OpenAI refusent en mode strict `minimum`, `maxLength`, `pattern` et leurs
 * semblables : la requête serait rejetée avant que le modèle n'écrive quoi que
 * ce soit. `z.number().int()` est le piège de la famille — Zod 4 lui adjoint
 * des bornes `minimum`/`maximum`, invisibles à la lecture du code. L'entier est
 * vérifié par `normalizeQuestion`, qui le confronte de toute façon au nombre
 * réel de propositions. `import.test.ts` monte la garde sur le schéma émis.
 */
const receivedQuestionSchema = z.object({
  type: z.enum(["single", "multiple", "text", "number"]).nullish(),
  prompt: z.string().nullish(),
  /** Propositions, pour les questions à choix. */
  options: z.array(z.string()).nullish(),
  /** Rangs (à partir de 0) des bonnes propositions. */
  correctOptionIndexes: z.array(z.number()).nullish(),
  correctText: z.string().nullish(),
  correctNumber: z.number().nullish(),
  correctFeedback: z.string().nullish(),
  incorrectFeedback: z.string().nullish(),
});

const receivedBlockSchema = z.object({
  type: z.enum(["markdown", "form"]).nullish(),
  /** Blocs `markdown` uniquement. */
  content: z.string().nullish(),
  /** Blocs `form` uniquement. */
  questions: z.array(receivedQuestionSchema).nullish(),
});

const receivedQuizSchema = z.object({
  title: z.string().nullish(),
  blocks: z.array(receivedBlockSchema).nullish(),
});

/** Question telle que le modèle la rend. */
export type ImportedQuestion = z.infer<typeof receivedQuestionSchema>;
export type ImportedBlock = z.infer<typeof receivedBlockSchema>;
export type ImportedQuiz = z.infer<typeof receivedQuizSchema>;

/**
 * Remet chaque propriété dans `required`. Une clé facultative côté Zod en sort,
 * et le modèle — qui ne voit que ce schéma — se croit alors libre de l'omettre.
 * C'est l'inverse qu'on veut : demander toutes les clés, et ne tolérer leur
 * absence qu'à la lecture.
 */
function requireEveryProperty(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(requireEveryProperty);
  }
  if (node === null || typeof node !== "object") {
    return node;
  }

  const result: Record<string, unknown> = Object.fromEntries(
    Object.entries(node as Record<string, unknown>).map(([key, value]) => [
      key,
      requireEveryProperty(value),
    ])
  );

  const properties = result.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    result.required = Object.keys(properties);
  }

  return result;
}

/**
 * Ce qu'on demande au modèle, et comment on lit sa réponse — les deux ne se
 * confondent pas : le schéma envoyé réclame tous les champs, la validation les
 * accepte tous absents.
 */
export const importedQuizSchema: Schema<ImportedQuiz> = jsonSchema<ImportedQuiz>(
  requireEveryProperty(zodSchema(receivedQuizSchema).jsonSchema) as Schema["jsonSchema"],
  {
    validate: (value) => {
      const result = receivedQuizSchema.safeParse(value);
      return result.success
        ? { success: true, value: result.data }
        : { success: false, error: result.error };
    },
  }
);

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
  blocks: ImportedBlock[] | null | undefined,
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
export function toQuizTitle(title: string | null | undefined): string {
  return bound(trimmed(title), LIMITS.title);
}
