"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth.ts";
import { locales } from "@/i18n/config.ts";
import {
  createPoster,
  deletePoster,
  PosterLimitError,
  PosterNameTakenError,
  updatePoster,
} from "@/lib/db/posters.ts";
import { savedPosterSchema, type SavedPosterFormInput } from "@/lib/schemas/saved-poster.schema.ts";
import { hasEntitlement } from "@/lib/subscriptions/access.ts";
import { resolvePosterStyle } from "@/lib/posters/styles.ts";
import type { SavedPoster } from "@/lib/types/SavedPoster";
import { getPosterForUser } from "@/lib/db/posters.ts";
import { getPosterDigest, setPosterDigestRefs } from "@/lib/db/poster-digest.ts";
import { toggleDigestRef } from "@/lib/posters/digest.ts";
import { formatPosterRef } from "@/lib/posters/references.ts";

export type SavePosterError =
  | "UNAUTHENTICATED"
  | "INVALID"
  | "LIMIT_REACHED"
  | "NAME_TAKEN"
  | "NOT_FOUND"
  | "FAILED";

export type SavePosterResult = { success: true; poster: SavedPoster } | { success: false; error: SavePosterError };
export type DeletePosterResult = { success: true } | { success: false; error: SavePosterError };

/**
 * Enregistre une affiche, ou réécrit celle qu'on désigne.
 *
 * Un seul point d'entrée pour les deux, parce que c'est une seule intention —
 * « garde ceci sous ce nom » — et que les deux traversent les mêmes contrôles :
 * la session, la forme, le style réservé. Seule la limite les sépare, et c'est
 * voulu : réécrire n'ajoute rien au compte, si bien qu'un abonnement arrêté
 * laisse ses affiches modifiables (voir `lib/posters/limits.ts`).
 */

/**
 * La revalidation **boucle sur les locales**.
 *
 * `revalidatePath("/affiches")` nu n'invalide que le français : les trois
 * autres langues garderaient leur bibliothèque en cache après un
 * enregistrement. Même motif, et même raison, que `account/showcase-actions.ts`.
 */
function revalidateLibrary() {
  for (const locale of locales) {
    revalidatePath(`/${locale}/affiches`);
  }
}
export async function saveMyPoster(
  input: SavedPosterFormInput,
  posterId?: string,
): Promise<SavePosterResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    if (!userId) {
      return { success: false, error: "UNAUTHENTICATED" };
    }

    const parsed = savedPosterSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "INVALID" };
    }

    const [styleUnlocked, unlimited] = await Promise.all([
      hasEntitlement("sub:poster-styles"),
      hasEntitlement("sub:poster-library"),
    ]);

    // Le style réservé se ramène au style par défaut plutôt que de refuser
    // l'enregistrement : c'est déjà ce que fait le rendu pour une affiche dont
    // l'abonnement s'est arrêté, et deux réponses différentes à la même
    // question seraient incompréhensibles.
    const data = { ...parsed.data, style: resolvePosterStyle(parsed.data.style, styleUnlocked) };

    const poster = posterId
      ? await updatePoster(posterId, userId, data)
      : await createPoster(userId, data, { unlimited });

    if (!poster) {
      return { success: false, error: "NOT_FOUND" };
    }

    revalidateLibrary();

    return { success: true, poster };
  } catch (error) {
    if (error instanceof PosterLimitError) {
      return { success: false, error: "LIMIT_REACHED" };
    }

    if (error instanceof PosterNameTakenError) {
      return { success: false, error: "NAME_TAKEN" };
    }

    console.error("Erreur lors de l'enregistrement d'une affiche:", error);

    return { success: false, error: "FAILED" };
  }
}

/** Supprime une affiche du compte connecté. Toujours permis : rien ne s'y oppose. */
export async function deleteMyPoster(posterId: string): Promise<DeletePosterResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    if (!userId) {
      return { success: false, error: "UNAUTHENTICATED" };
    }

    if (!(await deletePoster(posterId, userId))) {
      return { success: false, error: "NOT_FOUND" };
    }

    // Une affiche supprimée ne part plus le lundi.
    const digest = await getPosterDigest(userId);
    const ref = formatPosterRef({ kind: "poster", id: posterId });
    if (digest.refs.includes(ref)) {
      await setPosterDigestRefs(userId, digest.refs.filter((value) => value !== ref));
    }

    revalidateLibrary();

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la suppression d'une affiche:", error);

    return { success: false, error: "FAILED" };
  }
}

export type PosterDigestError = "UNAUTHENTICATED" | "NOT_ENTITLED" | "FULL" | "NOT_FOUND" | "FAILED";

export type PosterDigestResult =
  | { success: true; refs: string[] }
  | { success: false; error: PosterDigestError };

/**
 * Recevoir, ou non, cette affiche chaque lundi en message privé Discord
 * (Joutes Expert) — depuis l'affiche elle-même, sans passer par les réglages
 * de notification, qui montrent la même liste.
 *
 * Retirer reste permis sans abonnement : on ne retient personne.
 */
export async function togglePosterDigest(posterId: string, enabled: boolean): Promise<PosterDigestResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    if (!userId) {
      return { success: false, error: "UNAUTHENTICATED" };
    }

    if (enabled && !(await hasEntitlement("sub:poster-digest"))) {
      return { success: false, error: "NOT_ENTITLED" };
    }

    // Seulement une affiche du compte : l'identifiant vient du client.
    if (enabled && !(await getPosterForUser(posterId, userId))) {
      return { success: false, error: "NOT_FOUND" };
    }

    const { refs } = await getPosterDigest(userId);
    const next = toggleDigestRef(refs, formatPosterRef({ kind: "poster", id: posterId }), enabled);

    if (next === "full") {
      return { success: false, error: "FULL" };
    }

    await setPosterDigestRefs(userId, next);
    return { success: true, refs: next };
  } catch (error) {
    console.error("Erreur lors du réglage de l'envoi hebdomadaire d'une affiche:", error);
    return { success: false, error: "FAILED" };
  }
}
