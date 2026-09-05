import { NextResponse } from "next/server";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getGameStream } from "@/lib/db/game-streams";
import { readLiveEmbed } from "@/lib/media/live-embed";

/**
 * Le direct de l'éditeur, s'il diffuse en ce moment.
 *
 * Une route à part plutôt qu'un champ de `GET /games/{gameId}` : le catalogue
 * se garde longtemps en cache — sur le site comme sur le téléphone — et un
 * direct, lui, change à chaque tour du cron horaire. Le mettre sur la fiche
 * en ferait une valeur fausse la plupart du temps.
 *
 * Répond `{ live: null }` quand rien ne tourne : c'est le cas courant, et
 * l'absence de direct n'est pas une erreur. Public, comme la fiche du jeu.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  try {
    const stream = await getGameStream(game.id, "youtube");
    const live = stream?.live;
    if (!stream || !live?.url) {
      return NextResponse.json({ live: null });
    }

    // L'hôte ne sert qu'au `parent` du lecteur Twitch, que cette route ne
    // rend pas ; la vignette, elle, ne dépend de rien.
    const embed = readLiveEmbed(live.url, "localhost");

    return NextResponse.json({
      live: {
        platform: stream.platform,
        url: live.url,
        title: live.title,
        startedAt: live.startedAt,
        videoId: live.videoId,
        channelTitle: stream.channelTitle,
        channelUrl: stream.handle
          ? `https://www.youtube.com/${stream.handle}`
          : `https://www.youtube.com/channel/${stream.channelId}`,
        thumbnail: embed?.thumbnailUrl,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la lecture du direct du jeu:", error);
    return NextResponse.json({ error: "Erreur lors de la lecture du direct" }, { status: 500 });
  }
}
