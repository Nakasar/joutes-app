import { NextRequest, NextResponse } from "next/server";
import { getGameBySlugOrId } from "@/lib/db/games";
import { listGameSocialPosts, GAME_SOCIAL_KEEP, SOCIAL_SECTION_LIMIT } from "@/lib/db/game-social-posts";
import type { GameSocialPost } from "@/lib/types/GameSocialPost";

/**
 * Les publications rapatriées des réseaux de l'éditeur, les plus récentes
 * d'abord — ce que la section « Sur les réseaux » de la fiche montre.
 *
 * Même porte que les produits : le fanion `features.socialFeed` du jeu
 * commande la route, qui répond 404 quand il est éteint. Les publications
 * masquées par la modération ne sortent jamais, et les champs internes de la
 * collecte (identifiant externe, dates de collecte, masquage) non plus : un
 * client n'a besoin que de quoi afficher et ouvrir.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (!game.features?.socialFeed) {
    return NextResponse.json({ error: "Social feed is not enabled for this game" }, { status: 404 });
  }

  const limitRaw = parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, GAME_SOCIAL_KEEP) : SOCIAL_SECTION_LIMIT;

  try {
    const posts = await listGameSocialPosts(game.id, limit);
    return NextResponse.json({ posts: posts.map(toPublicPost) });
  } catch (error) {
    console.error("Erreur lors de la lecture des publications du jeu:", error);
    return NextResponse.json({ error: "Erreur lors de la lecture des publications" }, { status: 500 });
  }
}

function toPublicPost(post: GameSocialPost) {
  return {
    id: post.id,
    gameId: post.gameId,
    platform: post.platform,
    kind: post.kind,
    url: post.url,
    account: {
      handle: post.account.handle,
      displayName: post.account.displayName,
      avatar: post.account.avatar,
      url: post.account.url,
    },
    text: post.text,
    thumbnail: post.thumbnail,
    publishedAt: post.publishedAt,
    durationSeconds: post.durationSeconds,
  };
}
