import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import type { GameSocialPost } from "@/lib/types/GameSocialPost";

import SocialPostCard from "./social/SocialPostCard.tsx";

/**
 * « Sur les réseaux », en fin de fiche du jeu.
 *
 * Même patron que `GameNewsSection` — titre, action à droite, grille, et
 * `return null` quand il n'y a rien : le cas courant, pour la plupart des
 * fiches, est de n'avoir aucune publication, et un cadre vide y annoncerait un
 * contenu qui ne viendra pas.
 *
 * La grille diverge d'un cran : quatre colonnes au lieu de trois. Douze
 * vignettes sur trois colonnes feraient quatre rangées et écraseraient tout ce
 * qui suit ; et ces vignettes sont portées par l'image, là où une carte
 * d'actualité est portée par son texte.
 *
 * **Aucun bouton de masquage ici.** Il vit sur la page dédiée : voir
 * `HidePostButton`.
 */
export async function GameSocialSection({
  posts,
  gameSlug,
}: {
  posts: GameSocialPost[];
  gameSlug: string;
}) {
  if (posts.length === 0) {
    return null;
  }

  const t = await getTranslations("Games.detail.social");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-3xl font-bold text-white">{t("title")}</h2>
        <Button asChild variant="secondary">
          <Link href={`/games/${gameSlug}/social`}>{t("viewAll")}</Link>
        </Button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {posts.map((post) => (
          <SocialPostCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}
