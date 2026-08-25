import "server-only";

import { readAchievementsRanking } from "@/lib/db/achievements.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { listLiveStreamLinksForUsers, listLiveUserShowcases } from "@/lib/db/stream-links.ts";
import { getUserBadges, NO_BADGES, type UserBadges } from "@/lib/db/user-badges.ts";
import {
  countFollowersByUser,
  readFollowedUserIds,
  readMostFollowedUserIds,
} from "@/lib/db/user-followers.ts";
import {
  countPublicUsers,
  readPublicUserIds,
  readRegistryUsersByIds,
  searchPublicUsers,
} from "@/lib/db/users.ts";
import { getSellListForOwner } from "@/lib/db/sell-lists.ts";
import type { Game } from "@/lib/types/Game";
import {
  REGISTRY_MAX_COUNT,
  type RegistryFilters,
  type RegistryUser,
} from "@/lib/users/registry-search.ts";

/**
 * La lecture du registre de la communauté, indépendante de qui la demande.
 *
 * Extrait de `app/[locale]/(app)/users/registry-data.ts`, qui n'en garde que la
 * façade : la page l'enveloppe dans le `cache()` de React et lui passe le
 * visiteur de la session, l'API le lui passe depuis sa clé. Le `cache()` et
 * l'`await connection()` d'un rendu de page n'ont rien à faire dans un
 * handler d'API, et c'est tout ce qui séparait les deux usages.
 *
 * Le visiteur arrive donc **en paramètre** plutôt que d'être lu ici : c'est la
 * seule chose que les deux surfaces obtiennent différemment.
 */

/** Une fiche du registre, avec ce qui ne vit pas dans la collection `user`. */
export type RegistryEntry = {
  user: RegistryUser;
  badges: UserBadges;
  followers: number;
  isFollowing: boolean;
  isLive: boolean;
  games: Game[];
};

/**
 * Les comptes qui diffusent en ce moment **et l'annoncent sur leur profil**.
 *
 * La destination compte : une chaîne liée qui n'annonce que sur un lieu n'a pas
 * demandé à figurer ici. La liste des destinations *est* le réglage.
 */
export async function listLiveShowcases() {
  const links = await listLiveUserShowcases(12);
  if (links.length === 0) {
    return [];
  }

  const [users, badges] = await Promise.all([
    readRegistryUsersByIds(links.map((link) => link.userId)),
    getUserBadges(links.map((link) => link.userId)),
  ]);

  const byId = new Map(users.map((user) => [user.id, user]));

  return links
    .map((link) => {
      const user = byId.get(link.userId);
      // Un compte privé n'entre pas dans la bande : il n'a pas ouvert sa
      // vitrine, et son direct n'est pas une exception à cela.
      if (!user?.isPublicProfile || !link.live) {
        return null;
      }

      return {
        user,
        badges: badges[user.id] ?? NO_BADGES,
        live: link.live,
        platform: link.platform,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

/**
 * Les comptes qui vendent des cartes.
 *
 * La liste de vente ne vit pas dans la collection `user` : le filtre se résout
 * donc à part, et se croise ensuite. C'est aussi pour cela que
 * `RegistryUserFilter.userIds` existe.
 *
 * Une lecture par candidat, jusqu'à cent : c'est le filtre le plus cher du
 * registre, et la raison pour laquelle il est résolu en dernier.
 */
async function readSellerIds(candidateIds: string[]): Promise<string[]> {
  const lists = await Promise.all(
    candidateIds.map(async (id) => ({
      id,
      list: await getSellListForOwner({ type: "user", id }),
    })),
  );

  return lists.filter((entry) => (entry.list?.itemsCount ?? 0) > 0).map((entry) => entry.id);
}

/**
 * Les jeux de chaque fiche, résolus une seule fois pour toute la liste.
 *
 * Les vingt fiches se partagent une poignée de jeux : les lire par fiche
 * multiplierait par vingt ce qu'une union de leurs identifiants suffit à
 * couvrir. `readGameBySlugOrId` est de surcroît mis en cache par le dépôt.
 */
async function readGamesFor(users: RegistryUser[]): Promise<Map<string, Game[]>> {
  const gameIds = [...new Set(users.flatMap((user) => user.games))];
  const games = await Promise.all(gameIds.map((id) => readGameBySlugOrId(id)));
  const byId = new Map(
    games.filter((game): game is Game => game !== null).map((game) => [game.id, game]),
  );

  return new Map(
    users.map((user) => [
      user.id,
      user.games.map((id) => byId.get(id)).filter((game): game is Game => game !== undefined),
    ]),
  );
}

/**
 * Les fiches du registre.
 *
 * Deux filtres ne se posent pas dans la requête parce que leur donnée n'y est
 * pas — « en direct » vit dans `stream_links`, « vend des cartes » dans les
 * listes de vente. Ils sont résolus d'abord, puis croisés : c'est ce que
 * `userIds` porte.
 */
export async function searchRegistry(
  filters: RegistryFilters,
  viewerId: string | null,
): Promise<{ entries: RegistryEntry[]; total: number; hasMore: boolean }> {
  let userIds: string[] | undefined;

  if (filters.live) {
    const live = await listLiveShowcases();
    userIds = live.map((entry) => entry.user.id);
  }

  // L'ordre du classement par abonnés, que le `$in` de Mongo ne garantit pas :
  // la lecture rend les comptes dans l'ordre de la collection, et c'est ici
  // qu'on repose celui qu'on a demandé.
  let followerOrder: string[] | null = null;

  if (filters.sort === "followers") {
    followerOrder = await readMostFollowedUserIds(REGISTRY_MAX_COUNT);
    userIds = userIds ? userIds.filter((id) => followerOrder!.includes(id)) : followerOrder;
  }

  // « Vend des cartes » se résout en dernier : une lecture par candidat, et il
  // vaut mieux que les autres filtres aient déjà réduit la liste.
  if (filters.sells) {
    const candidates =
      userIds ??
      (
        await searchPublicUsers({
          query: filters.query,
          gameId: filters.gameId,
          city: filters.city,
          sort: filters.sort,
          limit: 100,
          skip: 0,
        })
      ).map((user) => user.id);

    userIds = await readSellerIds(candidates);
  }

  const [users, total] = await Promise.all([
    searchPublicUsers({
      query: filters.query,
      gameId: filters.gameId,
      city: filters.city,
      userIds,
      sort: filters.sort,
      limit: filters.count,
      skip: 0,
    }),
    countPublicUsers({
      query: filters.query,
      gameId: filters.gameId,
      city: filters.city,
      userIds,
    }),
  ]);

  const ids = users.map((user) => user.id);

  const [badges, followers, followed, liveLinks, games] = await Promise.all([
    getUserBadges(ids),
    countFollowersByUser(ids),
    viewerId ? readFollowedUserIds(viewerId) : Promise.resolve(new Set<string>()),
    listLiveStreamLinksForUsers(ids),
    readGamesFor(users),
  ]);

  const liveIds = new Set(
    liveLinks
      .filter((link) => link.targets.some((target) => target.kind === "user"))
      .map((link) => link.userId),
  );

  const ordered = followerOrder
    ? [...users].sort((a, b) => followerOrder.indexOf(a.id) - followerOrder.indexOf(b.id))
    : users;

  const entries: RegistryEntry[] = ordered.map((user) => ({
    user,
    badges: badges[user.id] ?? NO_BADGES,
    followers: followers.get(user.id) ?? 0,
    isFollowing: followed.has(user.id),
    isLive: liveIds.has(user.id),
    games: (games.get(user.id) ?? []).slice(0, 5),
  }));

  return {
    entries,
    total,
    // Au plafond, il n'y a plus rien à charger : le bouton s'afficherait sans
    // rien ajouter.
    hasMore: total > entries.length && filters.count < REGISTRY_MAX_COUNT,
  };
}

/**
 * Le classement des succès, et le rang du visiteur.
 *
 * **Un seul classement, un seul filtre.** Les profils privés en sont écartés —
 * y figurer serait apparaître dans un registre qu'on a choisi de quitter — et
 * le rang du visiteur est son index *dans ce classement-là*. Les calculer
 * séparément annoncerait un rang qui ne correspond à aucune place visible.
 */
export async function readAchievementsLeaderboard(viewerId: string | null) {
  const eligible = await readPublicUserIds();
  const ranking = await readAchievementsRanking(eligible);

  const top = ranking.slice(0, 3);
  const [users, badges] = await Promise.all([
    readRegistryUsersByIds(top.map((row) => row.userId)),
    getUserBadges(top.map((row) => row.userId)),
  ]);

  const byId = new Map(users.map((user) => [user.id, user]));

  const viewerIndex = viewerId ? ranking.findIndex((row) => row.userId === viewerId) : -1;

  return {
    rows: top
      .map((row) => {
        const user = byId.get(row.userId);
        return user ? { ...row, user, badges: badges[user.id] ?? NO_BADGES } : null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
    rank:
      viewerIndex === -1
        ? null
        : {
            rank: viewerIndex + 1,
            points: ranking[viewerIndex].points,
            unlocked: ranking[viewerIndex].unlocked,
            total: ranking.length,
          },
  };
}
