import { getTranslations } from "next-intl/server";
import { Settings, Trophy } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { PlanBadge } from "@/components/PlanBadge.tsx";
import { UserBadges } from "@/components/UserBadges.tsx";
import { ProfileAvatar } from "@/components/users/ProfileAvatar.tsx";
import { userProfilePath } from "@/lib/users/handle.ts";

import { readLeaderboard, readNearby, readOwnSummary } from "./registry-data.ts";

/**
 * La colonne de droite du registre.
 *
 * Plusieurs cartes dans un fichier, comme `LairSidebar` : elles se lisent
 * ensemble, elles se déplacent ensemble, et chacune disparaît quand elle n'a
 * rien à dire — un visiteur déconnecté n'en voit qu'une, et c'est correct.
 */

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** « Votre profil » : où il en est, et par où le finir. */
export async function YourProfileCard() {
  const [summary, t] = await Promise.all([
    readOwnSummary(),
    getTranslations("Users.registry.sidebar"),
  ]);

  if (!summary) {
    return null;
  }

  const { user, badges, completion } = summary;
  const displayName = user.displayName || user.username;

  return (
    <SidebarCard title={t("yourProfile")}>
      <div className="flex flex-wrap items-center gap-3">
        <ProfileAvatar
          src={user.profileImage || user.avatar}
          name={displayName}
          plan={badges.plan}
          size={44}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-semibold">
            {displayName}
            {user.discriminator && (
              <span className="font-mono text-xs text-muted-foreground">
                #{user.discriminator}
              </span>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <PlanBadge plan={badges.plan} />
            <span className="text-xs text-muted-foreground">
              {user.isPublicProfile ? t("public") : t("private")}
            </span>
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-[11px] text-muted-foreground">
          {t("completion", { percent: completion.percent })}
        </p>
        <div
          className="h-1.5 overflow-hidden rounded-[3px] bg-secondary"
          role="progressbar"
          aria-valuenow={completion.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("completion", { percent: completion.percent })}
        >
          <div
            className="h-full rounded-[3px] bg-primary"
            style={{ width: `${completion.percent}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/account?tab=showcase">{t("myShowcase")}</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/account">
            <Settings className="mr-1.5 size-3.5" aria-hidden />
            {t("settings")}
          </Link>
        </Button>
      </div>
    </SidebarCard>
  );
}

/** Les joueurs de la même commune. */
export async function NearbyCard() {
  const [nearby, t] = await Promise.all([
    readNearby(),
    getTranslations("Users.registry.sidebar"),
  ]);

  if (!nearby || nearby.users.length === 0) {
    return null;
  }

  return (
    <SidebarCard title={t("nearby", { city: nearby.city })}>
      {/* Au niveau de la commune, et seulement pour les comptes qui l'ont
          autorisée : la position exacte de personne n'entre ici. */}
      <p className="text-[13px] text-muted-foreground">{t("nearbyHint")}</p>

      <ul className="flex flex-col gap-2">
        {nearby.users.map(({ user, badges }) => (
          <li key={user.id}>
            <Link
              href={userProfilePath(user)}
              className="flex items-center gap-2.5 rounded-lg border p-2 transition-colors hover:bg-accent"
            >
              <ProfileAvatar
                src={user.avatar}
                name={user.displayName || user.username}
                plan={badges.plan}
                size={28}
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {user.displayName || user.username}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SidebarCard>
  );
}

/** Le classement des succès, et le rang du visiteur. */
export async function LeaderboardCard() {
  const [leaderboard, t] = await Promise.all([
    readLeaderboard(),
    getTranslations("Users.registry.sidebar"),
  ]);

  if (leaderboard.rows.length === 0) {
    return null;
  }

  return (
    <SidebarCard title={t("leaderboard")}>
      <ol className="flex flex-col gap-2">
        {leaderboard.rows.map((row, index) => (
          <li key={row.userId}>
            <Link
              href={userProfilePath(row.user)}
              className="flex items-center gap-2.5 rounded-lg border p-2 transition-colors hover:bg-accent"
            >
              <span className="w-4 shrink-0 text-center font-mono text-xs text-muted-foreground">
                {index + 1}
              </span>
              <ProfileAvatar
                src={row.user.avatar}
                name={row.user.displayName || row.user.username}
                plan={row.badges.plan}
                size={26}
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.user.displayName || row.user.username}
              </span>
              <span className="shrink-0 font-mono text-xs text-amber-600 dark:text-amber-400">
                {t("points", { points: row.points })}
              </span>
            </Link>
          </li>
        ))}
      </ol>

      {leaderboard.rank ? (
        <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Trophy className="size-3.5 shrink-0" aria-hidden />
          {t("yourRank", { rank: leaderboard.rank.rank, points: leaderboard.rank.points })}
        </p>
      ) : (
        // Ne pas figurer au classement n'est pas être dernier : le dire évite
        // de chercher une panne là où il n'y en a pas.
        <p className="text-[13px] text-pretty text-muted-foreground">{t("notRanked")}</p>
      )}
    </SidebarCard>
  );
}

/**
 * La légende des badges.
 *
 * Deux phrases, et c'est tout leur intérêt : sans elles, une pastille achetée
 * et une pastille méritée se lisent comme un seul classement.
 */
export async function BadgeLegendCard() {
  const t = await getTranslations("Users.registry.sidebar");

  return (
    <SidebarCard title={t("badgeLegend")}>
      <dl className="flex flex-col gap-3 text-[13px]">
        <div className="flex flex-col gap-0.5">
          <dt className="font-medium">{t("planLegendTitle")}</dt>
          <dd className="text-pretty text-muted-foreground">{t("planLegend")}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="font-medium">{t("statusLegendTitle")}</dt>
          <dd className="text-pretty text-muted-foreground">{t("statusLegend")}</dd>
        </div>
      </dl>

      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/pricing">{t("seePlans")}</Link>
      </Button>
    </SidebarCard>
  );
}

/** Ce que voit un visiteur déconnecté à la place de « Votre profil ». */
export async function SignedOutCard() {
  const t = await getTranslations("Users.registry.sidebar");

  return (
    <SidebarCard title={t("joinTitle")}>
      <p className="text-[13px] text-pretty text-muted-foreground">{t("joinHint")}</p>
      <Button size="sm" asChild className="self-start">
        <Link href="/login">{t("signIn")}</Link>
      </Button>
    </SidebarCard>
  );
}
