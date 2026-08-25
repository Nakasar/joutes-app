import { NextRequest, NextResponse } from "next/server";

import { readPlayGroupVisitor } from "@/lib/api/play-groups";
import { getGameSummariesByIds } from "@/lib/db/games";
import {
  countPlayGroupFollowers,
  isFollowingPlayGroup,
  sortPlayGroupAnnouncements,
} from "@/lib/db/play-groups";
import { listPublicContentsByAuthors } from "@/lib/db/user-contents";
import { getUsersByIds } from "@/lib/db/users";
import { readLiveEmbed } from "@/lib/media/live-embed";
import { readPlayGroupVisibility } from "@/lib/play-groups/access";
import { isFreshLive } from "@/lib/play-groups/explore";

type Params = Promise<{ playGroupId: string }>;

/**
 * La vitrine publique d'un groupe.
 *
 * **Sans session, et servie même pour un groupe privé** : sa vitrine reste
 * ouverte à qui en a l'adresse — c'est ce qui permet d'inviter quelqu'un à la
 * regarder — et seule sa présence au rôle d'armes lui est retirée. `indexable`
 * dit alors `false` : un groupe privé qui ressortirait d'une recherche ne
 * serait pas privé.
 *
 * Rien de privé n'y passe : ni sondages, ni sessions, ni activité nominative.
 * **Les annonces n'y arrivent que si leur portée est `public`** — c'est la
 * règle de la page web, et l'endroit où une erreur se paierait le plus cher.
 *
 * Les publications des membres remontent ici, mais seulement celles qu'ils ont
 * rendues publiques : un brouillon n'apparaît nulle part, ni sur sa propre
 * vitrine ni sur celle de ses groupes.
 *
 * Un direct déclaré la veille n'en est plus un (`isFreshLive`) : rien ne les
 * retire automatiquement, et un direct oublié tiendrait la vitrine
 * indéfiniment.
 */
export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId } = await params;

    const visitor = await readPlayGroupVisitor(request, playGroupId);
    if (!visitor) {
      return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
    }

    const { group, userId, role } = visitor;
    const memberIds = group.members.map((member) => member.userId);

    // Le `parent` que Twitch exige pour son lecteur intégré. Un client mobile
    // n'intègre rien — il ouvre `channelUrl` — mais l'hôte doit être fourni
    // pour que la lecture aboutisse.
    const host = request.headers.get("host") ?? "joutes.fr";
    const now = Date.now();

    const [followerCount, following, streamers, games, memberContents] = await Promise.all([
      countPlayGroupFollowers(playGroupId),
      userId ? isFollowingPlayGroup(playGroupId, userId) : Promise.resolve(false),
      getUsersByIds([
        ...new Set((group.options?.lives ?? []).map((live) => live.memberId)),
      ]),
      getGameSummariesByIds(group.enabledGameIds ?? []),
      listPublicContentsByAuthors(memberIds),
    ]);

    const streamerById = new Map(streamers.map((user) => [user.id, user]));
    const gameById = new Map(games.map((game) => [game.id, game]));

    const lives = (group.options?.lives ?? []).flatMap((live) => {
      const embed = readLiveEmbed(live.url, host);
      if (!embed || !isFreshLive(live.startedAt, now)) {
        return [];
      }

      const streamer = streamerById.get(live.memberId);

      return [
        {
          id: live.id,
          title: live.title,
          // Jamais l'adresse e-mail : cette réponse est servie sans session.
          streamer: streamer?.displayName || streamer?.username || live.memberId,
          gameName: live.gameId ? (gameById.get(live.gameId)?.name ?? null) : null,
          viewers: typeof live.viewers === "number" ? live.viewers : null,
          startedAt: live.startedAt,
          channelUrl: embed.channelUrl,
          platform: embed.platform,
        },
      ];
    });

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        visibility: readPlayGroupVisibility(group),
        theme: group.options?.theme,
        links: group.options?.links ?? [],
        rhythm: group.options?.rhythm,
        memberCount: group.members.length,
        createdAt: group.createdAt,
      },
      /** Un groupe privé demande aux moteurs de ne pas le référencer. */
      indexable: readPlayGroupVisibility(group) === "public",
      followerCount,
      isFollowing: following,
      isMember: role !== null,
      games: games.map((game) => ({ id: game.id, name: game.name, icon: game.icon })),
      announcements: sortPlayGroupAnnouncements(
        (group.options?.announcements ?? []).filter((item) => item.scope === "public"),
      ),
      contents: group.options?.contents ?? [],
      memberContents,
      lives,
    });
  } catch (error) {
    console.error("Error reading a play group showcase:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
