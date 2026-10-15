"use server";

import { requireAdmin } from "@/lib/middleware/admin.ts";
import { searchUsersForAdmin } from "@/lib/db/users.ts";
import { searchLairsForAdmin } from "@/lib/db/lairs.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { adminUserProfilePath, adminUserTag } from "@/lib/users/admin-search.ts";

export type AdminSearchHit = {
  href: string;
  label: string;
  hint?: string;
};

export type AdminSearchResults = {
  users: AdminSearchHit[];
  lairs: AdminSearchHit[];
  games: AdminSearchHit[];
};

const EMPTY: AdminSearchResults = { users: [], lairs: [], games: [] };

/**
 * Ce que la palette Ctrl K trouve hors des pages de l'administration : des
 * joueurs, des lieux et des jeux, cinq de chaque au plus.
 *
 * Les joueurs se cherchent comme sur la page Utilisateurs (pseudonyme, tag ou
 * identifiant, jamais l'adresse e-mail) ; les lieux privés sont compris.
 */
export async function searchAdminEverywhere(term: string): Promise<AdminSearchResults> {
  await requireAdmin();

  const trimmed = term.trim();
  if (trimmed.length < 2) {
    return EMPTY;
  }

  const [users, lairs, games] = await Promise.all([
    searchUsersForAdmin(trimmed, 5),
    searchLairsForAdmin(trimmed, 5),
    getAllGames(),
  ]);

  const needle = trimmed.toLocaleLowerCase("fr");

  return {
    users: users.map((user) => ({
      href: adminUserProfilePath(user),
      label: adminUserTag(user),
      hint: user.isPublicProfile ? "Profil public" : "Profil privé",
    })),
    lairs: lairs.map((lair) => ({
      href: `/admin/lairs/${lair.id}`,
      label: lair.name,
      hint: lair.address,
    })),
    games: games
      .filter((game) => game.name.toLocaleLowerCase("fr").includes(needle))
      .slice(0, 5)
      .map((game) => ({ href: `/admin/games/${game.slug ?? game.id}`, label: game.name })),
  };
}
