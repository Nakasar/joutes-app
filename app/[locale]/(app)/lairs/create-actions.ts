"use server";

import { auth } from "@/lib/auth.ts";
import { createLairForUser, type CreateLairInput, type CreateLairResult } from "@/lib/lairs/create.ts";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

/**
 * L'ouverture d'un lieu depuis l'annuaire.
 *
 * L'action ne fait que trois choses : elle reconnaît le compte, délègue la
 * décision à `createLairForUser` — plafond, doublon, validation — et purge les
 * pages que le nouveau lieu change. Aucune règle n'est écrite ici : elles vivent
 * dans `lib/lairs/`, où elles se testent sans base ni session.
 *
 * Les refus sortent en **codes** et non en phrases : une action serveur ne sait
 * pas dans quelle langue la page est rendue, et l'annuaire est traduit en quatre
 * langues.
 */
export type CreateLairActionResult =
  | { success: true; lairId: string }
  | { success: false; error: "NOT_AUTHENTICATED" }
  | Extract<CreateLairResult, { success: false }>;

export async function createLairAction(input: CreateLairInput): Promise<CreateLairActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return { success: false, error: "NOT_AUTHENTICATED" };
  }

  const result = await createLairForUser(session.user.id, input);

  if (!result.success) {
    return result;
  }

  revalidatePath("/lairs");
  revalidatePath("/account");

  return { success: true, lairId: result.lair.id };
}
