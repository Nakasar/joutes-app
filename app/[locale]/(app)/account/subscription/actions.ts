"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth.ts";
import { clearProviderLink } from "@/lib/db/subscriptions.ts";
import { PATREON_PROVIDER_ID, syncFromUserToken } from "@/lib/patreon/sync.ts";

/**
 * Les actions de l'écran « mon abonnement ».
 *
 * Elles suivent la forme des autres actions de `app/account` : session d'abord,
 * puis `{ success: false, error }` en cas de refus plutôt qu'une exception.
 */

type ActionResult = { success: true } | { success: false; error: string };

async function requireUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

/** Relit l'abonnement chez Patreon avec le jeton du compte. */
export async function resyncMySubscriptionAction(): Promise<ActionResult> {
  const userId = await requireUserId();

  if (!userId) {
    return { success: false, error: "Non authentifié" };
  }

  const outcome = await syncFromUserToken(userId, "manual");

  if (!outcome.ok) {
    return { success: false, error: outcome.reason };
  }

  revalidatePath("/account/subscription");
  return { success: true };
}

/**
 * Délie Patreon et éteint les droits.
 *
 * Les deux opérations vont ensemble, et c'est le point à ne pas manquer : sans
 * `clearProviderLink`, better-auth supprimerait la ligne `account` en nous
 * laissant une projection orpheline, et le droit survivrait à sa preuve. Le cron
 * finirait par le rattraper, mais un abonnement délié doit s'éteindre tout de
 * suite, pas le lendemain matin.
 *
 * Les sièges de lieu sont conservés : relier son compte doit redonner ses lieux
 * sans avoir à les rattacher de nouveau.
 */
export async function unlinkPatreonAction(): Promise<ActionResult> {
  const userId = await requireUserId();

  if (!userId) {
    return { success: false, error: "Non authentifié" };
  }

  try {
    await auth.api.unlinkAccount({
      body: { providerId: PATREON_PROVIDER_ID },
      headers: await headers(),
    });
  } catch (error) {
    console.error("Impossible de délier Patreon:", error);
    return { success: false, error: "unlink-failed" };
  }

  await clearProviderLink(userId);

  revalidatePath("/account/subscription");
  return { success: true };
}
