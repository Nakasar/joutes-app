import { NextResponse } from "next/server";
import { toPublicUserProfile } from "@/lib/db/users";
import { getAllGames } from "@/lib/db/games";
import { getLairsByIds } from "@/lib/db/lairs";
import { getAchievementsForUser } from "@/lib/db/achievements";
import { getBadgesForUser } from "@/lib/db/user-badges";
import { countUserFollowers, isFollowingUser } from "@/lib/db/user-followers";
import { getStreamLinksForUser } from "@/lib/db/stream-links";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { findUserByParam } from "@/lib/api/users";
import { readUserLinks } from "@/lib/users/links";
import { readUserShowcaseSections } from "@/lib/users/showcase";

type Params = Promise<{ userTagOrId: string }>;

/**
 * Le profil public d'un compte, dans la forme que sa vitrine demande.
 *
 * Ce qui est **toujours** rendu, profil privé compris : le pseudonyme, l'avatar,
 * la description, les liens, les badges, l'ancienneté et le nombre d'abonnés.
 * La porte de confidentialité n'est pas une porte d'accès — un profil
 * inatteignable serait un profil insignalable.
 *
 * Ce qui demande `isPublicProfile` : les jeux et lieux suivis, les succès, le
 * direct en cours. C'était déjà la règle de cette route, elle ne bouge pas.
 *
 * `isFollowing` n'a de sens que pour un appelant identifié ; sans session ni
 * clé d'API, il vaut `false` sans qu'aucune lecture soit faite.
 */
export async function GET(request: Request, { params }: { params: Params }) {
  const { userTagOrId } = await params;

  try {
    const user = await findUserByParam(userTagOrId);
    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    const profile = toPublicUserProfile(user);
    const isPublic = user.isPublicProfile ?? false;

    const viewer = await authenticateApiRequest(request);

    const [games, lairs, achievements, live] = isPublic
      ? await Promise.all([
          getAllGames().then((all) =>
            all
              .filter((g) => user.games.includes(g.id))
              .map((g) => ({ id: g.id, name: g.name, slug: g.slug, icon: g.icon }))
          ),
          getLairsByIds(user.lairs).then((all) =>
            all.map((l) => ({ id: l.id, name: l.name, address: l.address }))
          ),
          getAchievementsForUser(user.id).then((all) =>
            all
              .filter((a) => a.unlockedAt)
              .map((a) => ({
                id: a.id,
                name: a.name,
                description: a.description,
                icon: a.icon,
                points: a.points,
                unlockedAt: a.unlockedAt,
              }))
          ),
          // La destination *est* le réglage : une chaîne liée n'annonce son
          // direct sur ce profil que si elle le vise explicitement.
          getStreamLinksForUser(user.id).then(
            (links) =>
              links.find(
                (link) =>
                  link.live && link.targets.some((t) => t.kind === "user" && t.id === user.id)
              )?.live ?? null
          ),
        ])
      : [[], [], [], null];

    const [badges, followersCount, isFollowing] = await Promise.all([
      getBadgesForUser(user.id),
      countUserFollowers(user.id),
      viewer && viewer.userId !== user.id
        ? isFollowingUser(user.id, viewer.userId)
        : Promise.resolve(false),
    ]);

    return NextResponse.json({
      ...profile,
      createdAt: user.createdAt,
      banner: user.showcase?.banner,
      showcase: {
        sections: readUserShowcaseSections(user),
        links: readUserLinks(user),
        pinnedDeckId: user.showcase?.pinnedDeckId,
        playStyles: user.showcase?.playStyles ?? [],
      },
      badges,
      followersCount,
      isFollowing,
      live,
      games,
      lairs,
      achievements,
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
