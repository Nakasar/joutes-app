"use server";

import { revalidatePath } from "next/cache";

import { setGameSocialPostHidden } from "@/lib/db/game-social-posts";
import { requireAdmin } from "@/lib/middleware/admin.ts";

/**
 * Masquer, ou réafficher, une publication reprise d'un réseau.
 *
 * Un fichier d'actions **à part** de `[gameSlugOrId]/actions.ts` : celui-là
 * importe Meilisearch et tout le dossier des erratas, qu'une vignette n'a
 * aucune raison de charger.
 *
 * Le geste est le seul recours possible sur un flux qu'on ne maîtrise pas : la
 * collecte est automatique, et un éditeur peut publier ce que Joutes ne veut
 * pas relayer. Il tient parce que la base en fait une **pierre tombale** — le
 * document masqué n'est supprimé ni par la purge de rétention, ni par le
 * ménage, si bien que le tour de collecte suivant ne peut pas le ressusciter.
 * Voir `lib/db/game-social-posts.ts`.
 *
 * `gameSlug` est **passé en argument** plutôt que relu depuis la publication
 * puis le jeu : c'est déjà ce que fait `deleteErrata(errataId, cardIds)`, et
 * cela épargne deux lectures pour une valeur que l'écran a sous la main. Il ne
 * sert qu'à la revalidation, jamais à l'autorisation — celle-ci ne dépend que
 * de `requireAdmin`.
 */
export async function setSocialPostHidden(
  postId: string,
  hidden: boolean,
  gameSlug: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAdmin();

    const updated = await setGameSocialPostHidden(postId, hidden, session.user.id);

    if (!updated) {
      return { success: false, error: "Publication introuvable" };
    }

    // Les deux écrans lisent la base derrière `connection()` et ne sont donc
    // pas en cache : la revalidation est une ceinture, pas une nécessité. Elle
    // ne coûte rien, on la garde.
    revalidatePath(`/games/${gameSlug}`);
    revalidatePath(`/games/${gameSlug}/social`);

    return { success: true };
  } catch (error) {
    console.error("Masquage d'une publication en échec:", postId, error);
    return { success: false, error: "Le masquage a échoué" };
  }
}
