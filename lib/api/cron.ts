import { timingSafeEqual } from "node:crypto";

/**
 * L'appel vient-il bien du planificateur ?
 *
 * Vercel envoie `Authorization: Bearer <CRON_SECRET>` à chaque tâche planifiée.
 * Deux précautions, réunies ici pour que toutes les tâches les partagent :
 *
 * - **le secret doit exister.** Sans ce contrôle, un `CRON_SECRET` absent fait
 *   comparer l'en-tête à la chaîne littérale « Bearer undefined », que
 *   n'importe qui peut envoyer ;
 * - **la comparaison est à temps constant**, pour qu'un appelant ne puisse pas
 *   deviner le secret caractère par caractère en mesurant les réponses.
 *
 * `secret` n'est un paramètre que pour les tests : les routes n'en passent pas.
 */
export function isCronAuthorized(
  request: Request,
  secret: string | undefined = process.env.CRON_SECRET,
): boolean {
  if (!secret) return false;

  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);

  // `timingSafeEqual` exige deux tampons de même longueur ; une longueur
  // différente est déjà un refus, et ne révèle que la longueur du secret.
  return received.length === expected.length && timingSafeEqual(received, expected);
}
