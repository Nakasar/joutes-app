"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth.ts";
import { locales } from "@/i18n/config.ts";
import {
  createUserContent,
  deleteUserContent,
  setUserContentVisibility,
  updateUserContent,
  UserContentLimitError,
} from "@/lib/db/user-contents.ts";
import { getPlayGroupsForUser } from "@/lib/db/play-groups.ts";
import {
  userContentSchema,
  type UserContentInput,
} from "@/lib/schemas/user-content.schema.ts";
import type { UserContentVisibility } from "@/lib/types/UserContent";

/**
 * Ce qu'un joueur fait de ses publications.
 *
 * Les échecs sortent en **codes** plutôt qu'en phrases : ces actions ne savent
 * pas dans quelle langue la page est rendue, le formulaire qui les appelle si.
 *
 * **La revalidation touche aussi les groupes du compte.** Un contenu public
 * remonte sur leurs vitrines : le publier, le retirer ou le repasser en
 * brouillon change ce qu'elles montrent, et ne pas les invalider laisserait un
 * brouillon affiché là où on croyait l'avoir caché.
 */

export type ContentError =
  | "UNAUTHENTICATED"
  | "INVALID"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "LIMIT"
  | "FAILED";

export type ContentResult =
  | { success: true; id: string }
  | { success: false; error: ContentError; issues?: Record<string, string> };

function issuesOf(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join(".") || "_", issue.message]),
  );
}

async function revalidateContents(userId: string) {
  for (const locale of locales) {
    revalidatePath(`/${locale}/account/contents`);
    revalidatePath(`/${locale}/account`);
  }

  // `[locale]` compris : ce chemin désigne la structure de fichiers de routes,
  // pas l'URL que next-intl réécrit.
  revalidatePath("/[locale]/users/[userTagOrId]", "page");

  // Les vitrines des groupes du compte : un contenu public y figure.
  const groups = await getPlayGroupsForUser(userId);
  for (const group of groups) {
    for (const locale of locales) {
      revalidatePath(`/${locale}/play-groups/${group.id}`, "layout");
    }
  }
}

async function requireUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

/** Crée une publication, ou réécrit celle qu'on désigne. */
export async function saveUserContentAction(
  id: string | null,
  input: UserContentInput,
): Promise<ContentResult> {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return { success: false, error: "UNAUTHENTICATED" };
    }

    const parsed = userContentSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "INVALID", issues: issuesOf(parsed.error) };
    }

    if (id) {
      // La propriété est dans le filtre de l'écriture, pas vérifiée en amont :
      // un `null` en retour dit à la fois « n'existe pas » et « pas à vous »,
      // et l'écran n'a pas à distinguer les deux.
      const updated = await updateUserContent(id, userId, parsed.data);
      if (!updated) {
        return { success: false, error: "NOT_FOUND" };
      }

      await revalidateContents(userId);
      return { success: true, id: updated.id };
    }

    const created = await createUserContent(userId, parsed.data);
    await revalidateContents(userId);
    return { success: true, id: created.id };
  } catch (error) {
    if (error instanceof UserContentLimitError) {
      return { success: false, error: "LIMIT" };
    }

    console.error("Enregistrement d'une publication impossible", error);
    return { success: false, error: "FAILED" };
  }
}

export async function deleteUserContentAction(id: string): Promise<ContentResult> {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return { success: false, error: "UNAUTHENTICATED" };
    }

    const deleted = await deleteUserContent(id, userId);
    if (!deleted) {
      return { success: false, error: "NOT_FOUND" };
    }

    await revalidateContents(userId);
    return { success: true, id };
  } catch (error) {
    console.error("Suppression d'une publication impossible", error);
    return { success: false, error: "FAILED" };
  }
}

export async function setUserContentVisibilityAction(
  id: string,
  visibility: UserContentVisibility,
): Promise<ContentResult> {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return { success: false, error: "UNAUTHENTICATED" };
    }

    const updated = await setUserContentVisibility(id, userId, visibility);
    if (!updated) {
      return { success: false, error: "NOT_FOUND" };
    }

    await revalidateContents(userId);
    return { success: true, id };
  } catch (error) {
    console.error("Changement de visibilité impossible", error);
    return { success: false, error: "FAILED" };
  }
}
