"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth.ts";
import { locales } from "@/i18n/config.ts";
import {
  getUserById,
  updateUserProfileImage,
  updateUserProfileInfo,
  updateUserProfileVisibility,
  updateUserShowcase,
} from "@/lib/db/users.ts";
import { plansForUserId } from "@/lib/subscriptions/access.ts";
import { grantsEntitlement } from "@/lib/subscriptions/entitlements.ts";
import {
  userShowcaseSchema,
  type UserShowcaseInput,
} from "@/lib/schemas/user-showcase.schema.ts";

/**
 * Ce qu'on règle sur sa propre vitrine.
 *
 * Les échecs sortent en **codes** plutôt qu'en phrases : ces actions ne savent
 * pas dans quelle langue la page est rendue, le formulaire qui les appelle si.
 *
 * La revalidation **boucle sur les locales**. `revalidatePath("/account")` nu —
 * ce que fait encore `account/actions.ts` — n'invalide que le français, les
 * trois autres gardant leur page en cache après un enregistrement.
 */

export type ShowcaseError = "UNAUTHENTICATED" | "INVALID" | "NOT_FOUND" | "FAILED";

export type ShowcaseResult =
  | { success: true }
  | { success: false; error: ShowcaseError; issues?: Record<string, string> };

/** Les messages de Zod, à plat, pour que le formulaire les repose sur ses champs. */
function issuesOf(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join(".") || "_", issue.message]),
  );
}

function revalidateShowcase() {
  for (const locale of locales) {
    revalidatePath(`/${locale}/account`);
  }
  // On arrive sur un profil par son pseudonyme, jamais par son identifiant :
  // c'est le motif de route qu'il faut invalider.
  revalidatePath("/users/[userTagOrId]", "page");
  revalidatePath("/users", "page");
}

async function requireUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

/**
 * Enregistre la vitrine.
 *
 * **Un champ réservé n'est pas refusé, il est conservé.** Sans le droit
 * `sub:profile-banner`, la bannière déjà en base reste telle quelle et le reste
 * s'enregistre — c'est la règle de la personnalisation d'un lieu, et pour la
 * même raison : quelqu'un dont l'abonnement s'est arrêté doit pouvoir continuer
 * à ranger ses blocs sans que le formulaire lui oppose un mur, et sans perdre
 * la bannière qu'il avait posée du temps de son abonnement.
 *
 * Le contrôle est refait ici et non seulement dans le formulaire : un champ
 * désactivé dans le navigateur ne protège rien, l'action reste appelable telle
 * quelle.
 */
export async function updateShowcaseAction(input: UserShowcaseInput): Promise<ShowcaseResult> {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return { success: false, error: "UNAUTHENTICATED" };
    }

    const parsed = userShowcaseSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "INVALID", issues: issuesOf(parsed.error) };
    }

    const [user, plans] = await Promise.all([getUserById(userId), plansForUserId(userId)]);
    if (!user) {
      return { success: false, error: "NOT_FOUND" };
    }

    const canUseBanner = grantsEntitlement(plans, "sub:profile-banner");

    const updated = await updateUserShowcase(userId, {
      ...parsed.data,
      banner: canUseBanner ? parsed.data.banner : user.showcase?.banner,
    });

    if (!updated) {
      return { success: false, error: "NOT_FOUND" };
    }

    revalidateShowcase();
    return { success: true };
  } catch (error) {
    console.error("Enregistrement de la vitrine impossible", error);
    return { success: false, error: "FAILED" };
  }
}

/**
 * Ouvrir ou fermer son profil.
 *
 * Séparée de l'enregistrement de la vitrine, et volontairement : c'est le seul
 * interrupteur de l'écran qui change ce que des inconnus voient, et il agit
 * immédiatement plutôt que d'attendre un « Enregistrer » qu'on pourrait
 * oublier.
 */
export async function setProfileVisibilityAction(isPublic: boolean): Promise<ShowcaseResult> {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return { success: false, error: "UNAUTHENTICATED" };
    }

    const updated = await updateUserProfileVisibility(userId, isPublic);
    if (!updated) {
      return { success: false, error: "NOT_FOUND" };
    }

    revalidateShowcase();
    return { success: true };
  } catch (error) {
    console.error("Changement de visibilité impossible", error);
    return { success: false, error: "FAILED" };
  }
}

/**
 * L'avatar et la description, réglés dans le même écran mais **écrits ailleurs**.
 *
 * Ils vivent à plat sur le compte, et le schéma de vitrine les garde distincts
 * pour que celle-ci ne devienne pas un chemin détourné vers le reste du
 * document.
 */
export async function updateIdentityAction(input: {
  description?: string;
  profileImage?: string;
}): Promise<ShowcaseResult> {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return { success: false, error: "UNAUTHENTICATED" };
    }

    const schema = z.object({
      description: z.string().trim().max(500, "La description est trop longue").optional(),
      profileImage: z.string().trim().max(2048).optional(),
    });

    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "INVALID", issues: issuesOf(parsed.error) };
    }

    await Promise.all([
      updateUserProfileInfo(userId, { description: parsed.data.description ?? "" }),
      updateUserProfileImage(userId, parsed.data.profileImage ?? ""),
    ]);

    revalidateShowcase();
    return { success: true };
  } catch (error) {
    console.error("Enregistrement de l'identité impossible", error);
    return { success: false, error: "FAILED" };
  }
}
