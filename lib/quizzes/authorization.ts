import 'server-only';

import { hasPermission } from "@/lib/db/permissions";
import type { Quiz } from "@/lib/types/Quiz";

/**
 * Qui peut toucher à un quizz.
 *
 * Écrire un quizz est ouvert à tout compte connecté : c'est un contenu
 * communautaire. Chacun gère les siens ; la main sur ceux des autres relève de
 * `quizzes:update-all`, réservée à la modération. La règle vaut pour la
 * modification, la traduction et la suppression — traduire un quizz, c'est en
 * modifier le contenu affiché.
 */
export async function canManageQuiz(
  quiz: Pick<Quiz, "authorId">,
  userId: string | undefined,
): Promise<boolean> {
  if (userId && quiz.authorId === userId) {
    return true;
  }

  return hasPermission("quizzes:update-all");
}
