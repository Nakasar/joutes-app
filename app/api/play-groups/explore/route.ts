import { NextRequest, NextResponse } from "next/server";

import { authenticateApiRequest } from "@/lib/api/authenticate";
import { readExploreRoll } from "@/lib/db/play-groups-explore";
import { readFollowedPlayGroupIds } from "@/lib/db/play-groups";
import {
  foldSearchText,
  matchesExploreQuery,
  readExploreOrder,
  sortExploreGroups,
} from "@/lib/play-groups/explore";

/** Ce que la page en rend au plus, et son pas de « charger plus ». */
const DEFAULT_COUNT = 20;
const MAX_COUNT = 100;

function readNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Le rôle d'armes : les groupes ouverts, et de quoi choisir lequel ouvrir.
 *
 * Session facultative — elle ajoute au rôle **les groupes privés dont on est
 * membre**, et renseigne `isFollowing` sur chaque ligne. Les groupes privés des
 * autres sont écartés par la requête elle-même, avant toute jointure : un
 * groupe qu'on ne doit pas voir ne doit pas quitter la base.
 *
 * Trois ordres. `vifs` classe par signe de vie — un direct passe devant tout,
 * puis une publication récente ou une session à venir, dont la valeur décroît
 * avec le temps. `neufs` par date de création. `proches` demande un point
 * (`lat`/`lng`) et ne peut ordonner que les groupes dont le lieu par défaut est
 * un lieu Joutes, seul à porter une adresse géocodée ; les autres partent en fin
 * de liste plutôt qu'à zéro kilomètre, ce qui serait mentir. **Sans point,
 * `proches` retombe sur `vifs`** au lieu de rendre une liste arbitraire.
 *
 * `q` cherche dans le nom, la devise, le rythme, le lieu et les jeux, sans
 * accents ni casse — personne ne tape « Dé » avec son accent.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const viewer = await authenticateApiRequest(request);
    const viewerId = viewer?.userId ?? null;

    const order = readExploreOrder(searchParams.get("order"));
    const latitude = readNumber(searchParams.get("lat"));
    const longitude = readNumber(searchParams.get("lng"));
    const origin =
      latitude !== undefined &&
      longitude !== undefined &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
        ? { latitude, longitude }
        : null;

    const count = Math.min(
      Math.max(readNumber(searchParams.get("count")) ?? DEFAULT_COUNT, 1),
      MAX_COUNT,
    );

    const roll = await readExploreRoll({
      host: request.headers.get("host") ?? "joutes.fr",
      viewerId,
    });

    const query = foldSearchText(searchParams.get("q") ?? "");
    const matching = roll.groups.filter((group) => matchesExploreQuery(group, query));

    const ordered = sortExploreGroups(matching, order, origin);
    const followed = viewerId ? await readFollowedPlayGroupIds(viewerId) : new Set<string>();

    return NextResponse.json({
      groups: ordered.slice(0, count).map((group) => ({
        ...group,
        isFollowing: followed.has(group.id),
      })),
      total: matching.length,
      hasMore: matching.length > count,
      count,
      /** L'ordre réellement appliqué : `proches` sans point retombe sur `vifs`. */
      order: order === "proches" && !origin ? "vifs" : order,
      lives: roll.lives,
      posts: roll.posts,
    });
  } catch (error) {
    console.error("Error reading the play groups roll:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
