import { NextResponse } from "next/server";
import { getUserByTagOrId, toPublicUserProfile } from "@/lib/db/users";
import { getAllGames } from "@/lib/db/games";
import { getLairsByIds } from "@/lib/db/lairs";
import { getAchievementsForUser } from "@/lib/db/achievements";

type Params = Promise<{ userTagOrId: string }>;

/**
 * L'URL ne peut pas porter un `#` littéral (délimiteur de fragment), donc les
 * liens vers un profil utilisent `${displayName}${discriminator}` sans
 * séparateur (voir `getSellListOwnerInfo`). On reconstruit le tag ici avant de
 * le passer à `getUserByTagOrId`, qui attend `displayName#discriminator`.
 */
function resolveUserTagOrId(raw: string): string {
  if (raw.includes("#") || /^[0-9a-fA-F]{24}$/.test(raw)) {
    return raw;
  }
  const discriminator = raw.slice(-4);
  const displayName = raw.slice(0, -4);
  return `${displayName}#${discriminator}`;
}

export async function GET(request: Request, { params }: { params: Params }) {
  const { userTagOrId } = await params;

  try {
    const user = await getUserByTagOrId(resolveUserTagOrId(decodeURIComponent(userTagOrId)));
    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    const profile = toPublicUserProfile(user);
    const isPublic = user.isPublicProfile ?? false;

    const [games, lairs, achievements] = isPublic
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
        ])
      : [[], [], []];

    return NextResponse.json({ ...profile, games, lairs, achievements });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
