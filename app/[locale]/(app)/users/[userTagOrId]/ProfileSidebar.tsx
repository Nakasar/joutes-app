import { getTranslations } from "next-intl/server";
import { Award, Gamepad2, MapPin, Star, Users } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";

import { ProfileLinkIcon } from "./ProfileLinkIcon.tsx";
import {
  readFollowersCount,
  readProfileGames,
  readProfileGroups,
  readProfileLairs,
  readProfileLinks,
  requireProfile,
} from "./profile-data.ts";

/**
 * La colonne de droite d'une vitrine de profil.
 *
 * Plusieurs cartes dans un fichier, comme `LairSidebar` : elles se lisent
 * ensemble, elles se déplacent ensemble, et chacune disparaît quand elle n'a
 * rien à dire.
 */

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Les jeux suivis, l'étoile sur les favoris. */
export async function FollowedGamesCard({ userTagOrId }: { userTagOrId: string }) {
  const [games, subject, t] = await Promise.all([
    readProfileGames(userTagOrId),
    requireProfile(userTagOrId),
    getTranslations("Users.profile.sidebar"),
  ]);

  if (games.length === 0) {
    return null;
  }

  const favourites = new Set(subject.user.favoriteGames ?? []);

  return (
    <SidebarCard title={t("games")}>
      <ul className="grid grid-cols-3 gap-2.5">
        {games.map((game) => (
          <li key={game.id}>
            <Link
              href={`/games/${game.slug ?? game.id}`}
              title={game.name}
              className="relative flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-background p-1.5 transition-colors hover:bg-accent"
            >
              {game.icon ? (
                // L'icône d'un jeu vient de la base : hôte non déclaré.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={game.icon} alt="" className="size-8 object-contain" />
              ) : (
                <Gamepad2 className="size-8 text-muted-foreground" aria-hidden />
              )}

              <span className="line-clamp-1 text-center text-[10px] text-muted-foreground">
                {game.name}
              </span>

              {favourites.has(game.id) && (
                <Star
                  className="absolute top-1 right-1 size-3 fill-amber-500 text-amber-500"
                  aria-label={t("favourite")}
                />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </SidebarCard>
  );
}

export async function FollowedLairsCard({ userTagOrId }: { userTagOrId: string }) {
  const [lairs, t] = await Promise.all([
    readProfileLairs(userTagOrId),
    getTranslations("Users.profile.sidebar"),
  ]);

  if (lairs.length === 0) {
    return null;
  }

  return (
    <SidebarCard title={t("lairs")}>
      <ul className="flex flex-col gap-2">
        {lairs.map((lair) => (
          <li key={lair.id}>
            <Link
              href={`/lairs/${lair.id}`}
              className="flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors hover:bg-accent"
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{lair.name}</span>
                {lair.address && (
                  <span className="truncate text-xs text-muted-foreground">{lair.address}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SidebarCard>
  );
}

/**
 * Les groupes de jeu publics.
 *
 * Bordé de violet — la teinte des groupes, celle de `--group-accent` par
 * défaut : c'est la seule couleur de cette colonne qui ne vient pas du palier,
 * et elle dit « ceci appartient à un autre écran ».
 */
export async function PlayGroupsCard({ userTagOrId }: { userTagOrId: string }) {
  const [groups, t] = await Promise.all([
    readProfileGroups(userTagOrId),
    getTranslations("Users.profile.sidebar"),
  ]);

  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-violet-500/40 bg-card p-5">
      <h2 className="text-[15px] font-semibold">{t("groups")}</h2>

      <ul className="flex flex-col gap-2">
        {groups.map((group) => (
          <li key={group.id}>
            <Link
              href={`/play-groups/${group.id}`}
              className="flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors hover:bg-accent"
            >
              <Users className="mt-0.5 size-4 shrink-0 text-violet-500" aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{group.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t("members", { count: group.members.length })}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** « Retrouver <pseudo> » : les liens, et le nombre d'abonnés. */
export async function FindMeCard({ userTagOrId }: { userTagOrId: string }) {
  const [links, followers, subject, t] = await Promise.all([
    readProfileLinks(userTagOrId),
    readFollowersCount(userTagOrId),
    requireProfile(userTagOrId),
    getTranslations("Users.profile.sidebar"),
  ]);

  if (links.length === 0 && followers === 0) {
    return null;
  }

  return (
    <SidebarCard title={t("findMe", { name: subject.displayName })}>
      {links.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {links.map((link) => (
            <li key={link.url}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex items-center gap-2.5 rounded-lg border p-2.5 text-sm transition-colors hover:bg-accent"
              >
                <ProfileLinkIcon kind={link.kind} className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">{link.label ?? link.host}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Award className="size-3.5 shrink-0" aria-hidden />
        {t("followers", { count: followers })}
      </p>
    </SidebarCard>
  );
}
