import { z } from "zod";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "L'ID doit être un ObjectId MongoDB valide");
// "" explicitly means "no game linked" — distinct from the field being absent
// (which means "leave unchanged" on a partial update).
const gameIdSchema = z.union([objectIdSchema, z.literal("")]);

const quizQuestionOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1, "Le texte de la réponse est requis").max(300, "Le texte de la réponse est trop long"),
});

const quizQuestionSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["single", "multiple", "text", "number"]),
    prompt: z.string().min(1, "La question est requise").max(1000, "La question est trop longue"),
    options: z.array(quizQuestionOptionSchema).max(20).optional(),
    correctOptionIds: z.array(z.string().min(1)).optional(),
    correctText: z.string().max(300).optional(),
    correctNumber: z.number().optional(),
    correctFeedback: z.string().max(2000).optional(),
    incorrectFeedback: z.string().max(2000).optional(),
  })
  .superRefine((question, ctx) => {
    if (question.type === "single" || question.type === "multiple") {
      if (!question.options || question.options.length < 2) {
        ctx.addIssue({
          code: "custom",
          message: "Au moins 2 réponses possibles sont requises",
          path: ["options"],
        });
      }
      if (!question.correctOptionIds || question.correctOptionIds.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Au moins une bonne réponse est requise",
          path: ["correctOptionIds"],
        });
      }
      if (question.type === "single" && (question.correctOptionIds?.length ?? 0) > 1) {
        ctx.addIssue({
          code: "custom",
          message: "Une seule bonne réponse est autorisée pour un choix unique",
          path: ["correctOptionIds"],
        });
      }
      if (question.correctOptionIds && question.correctOptionIds.length > 0) {
        const optionIds = new Set((question.options ?? []).map((option) => option.id));
        if (question.correctOptionIds.some((id) => !optionIds.has(id))) {
          ctx.addIssue({
            code: "custom",
            message: "Une bonne réponse doit correspondre à une réponse possible existante",
            path: ["correctOptionIds"],
          });
        }
        if (new Set(question.correctOptionIds).size !== question.correctOptionIds.length) {
          ctx.addIssue({
            code: "custom",
            message: "Les bonnes réponses ne doivent pas contenir de doublons",
            path: ["correctOptionIds"],
          });
        }
      }
    }
    if (question.type === "text" && !question.correctText?.trim()) {
      ctx.addIssue({ code: "custom", message: "La bonne réponse est requise", path: ["correctText"] });
    }
    if (question.type === "number" && question.correctNumber === undefined) {
      ctx.addIssue({ code: "custom", message: "La bonne réponse est requise", path: ["correctNumber"] });
    }
  });

const quizMarkdownBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("markdown"),
  content: z.string().min(1, "Le contenu du bloc est requis"),
});

const quizFormBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("form"),
  questions: z.array(quizQuestionSchema).min(1, "Un bloc formulaire doit contenir au moins une question"),
  showSubmitButton: z.boolean(),
});

const quizBlockSchema = z.discriminatedUnion("type", [quizMarkdownBlockSchema, quizFormBlockSchema]);

const quizBaseSchema = z.object({
  title: z.string().min(1, "Le titre est requis").max(200, "Le titre est trop long"),
  gameId: gameIdSchema.optional(),
  blocks: z.array(quizBlockSchema).min(1, "Le quizz doit contenir au moins un bloc"),
});

export const createQuizSchema = quizBaseSchema.extend({
  gameId: gameIdSchema.default(""),
});

export const updateQuizSchema = quizBaseSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  "Au moins un champ doit être modifié"
);

export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;
