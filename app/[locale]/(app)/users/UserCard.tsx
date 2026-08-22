import { getTranslations } from "next-intl/server";
import { Gamepad2, Lock, MapPin, Trophy } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { UserBadges } from "@/components/UserBadges.tsx";
import { LiveBadge } from "@/components/users/LiveBadge.tsx";
import { ProfileAvatar } from "@/components/users/ProfileAvatar.tsx";
import { userProfilePath } from "@/lib/users/handle.ts";
import { cn } from "@/lib/utils.ts";

import FollowUserButton from "./FollowUserButton.tsx";
import type { RegistryEntry } from "./registry-data.ts";

/**
 * Une fiche du registre.
 *
 * **Un profil privé y figure**, en pointillés et sans statistiques : son
 * pseudonyme et ses badges restent — une marque de reconnaissance posée par
 * l'équipe n'est pas du contenu — mais ce qu'il a choisi de ne pas publier
 * n'apparaît pas, et son bouton dit « profil privé » plutôt que de mener à une
 * page qui ne montrera rien.
 *
 * En pratique la recherche ne les ramène pas : `searchPublicUsers` filtre sur
 * `isPublicProfile`. La variante existe pour les listes qui les côtoient — un
 * classement, une commune — où les écarter ferait un trou inexplicable.
 */
export default async function UserCard({
  entry,
  isAuthenticated,
}: {
  entry: RegistryEntry;
  isAuthenticated: boolean;
}) {
  const t = await getTranslations("Users.registry.card");
  const { user, badges } = entry;

  const displayName = user.displayName || user.username;
  const tag = user.displayName && user.discriminator ? `${displayName}#${user.discriminator}` : null;
  const isPrivate = !user.isPublicProfile;

  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-4 rounded-xl border bg-card p-4",
        isPrivate && "border-dashed bg-muted/30",
      )}
    >
      <ProfileAvatar src={user.avatar} name={displayName} plan={badges.plan} size={64} />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="text-[17px] font-bold">{displayName}</span>
          {tag && (
            <span className="font-mono text-[13px] text-muted-foreground">
              #{user.discriminator}
            </span>
          )}
          {isPrivate && (
            <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("private")} />
          )}
          <UserBadges badges={badges} />
          {entry.isLive && <LiveBadge label={t("live")} />}
        </div>

        {!isPrivate && user.description && (
          <p className="line-clamp-2 max-w-[560px] text-[13px] text-pretty text-muted-foreground">
            {user.description}
          </p>
        )}

        {!isPrivate && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            {user.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3 shrink-0" aria-hidden />
                {user.city}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Trophy className="size-3 shrink-0" aria-hidden />
              {t("followers", { count: entry.followers })}
            </span>
            {entry.games.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Gamepad2 className="size-3 shrink-0" aria-hidden />
                {t("games", { count: user.games.length })}
              </span>
            )}
          </div>
        )}

        {!isPrivate && entry.games.length > 0 && (
          <ul className="flex flex-wrap items-center gap-1.5">
            {entry.games.map((game) => (
              <li key={game.id} title={game.name}>
                {game.icon ? (
                  // L'icône d'un jeu vient de la base : hôte non déclaré.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={game.icon}
                    alt={game.name}
                    className="size-[22px] rounded object-contain"
                  />
                ) : (
                  <span className="inline-flex size-[22px] items-center justify-center rounded bg-muted">
                    <Gamepad2 className="size-3 text-muted-foreground" aria-hidden />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isPrivate ? (
          <span className="inline-flex min-h-11 items-center rounded-md border border-dashed px-3 text-xs text-muted-foreground sm:min-h-9">
            {t("private")}
          </span>
        ) : (
          <>
            <Button variant="outline" size="sm" asChild className="min-h-11 sm:min-h-9">
              <Link href={userProfilePath(user)}>{t("seeProfile")}</Link>
            </Button>
            {isAuthenticated && (
              <FollowUserButton userId={user.id} isFollowing={entry.isFollowing} />
            )}
          </>
        )}
      </div>
    </li>
  );
}
