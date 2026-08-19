// Le `Link` conscient de la langue : `next/link` perdrait le préfixe de locale
// et renverrait vers une route qui n'existe plus depuis le passage à /[locale].
import { Link } from "@/i18n/navigation.ts";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button.tsx";
import { countUserAttendanceBetween } from "@/lib/db/events.ts";
import { isHalloweenTheme, isInSeason, seasonBounds } from "@/lib/utils/halloween-theme.ts";

/** Nombre d'événements à faire pour décrocher le badge. */
export const SEASON_GOAL = 3;

/**
 * Le bandeau du défi de saison.
 *
 * La règle est la plus simple qui tienne : trois événements pendant la
 * saison, sans condition de lieu ni de jeu. Ce qui se vérifie d'un coup
 * d'œil se raconte en une phrase, et personne n'a à ouvrir les conditions
 * pour savoir où il en est.
 *
 * Ne s'affiche que pendant la saison, et seulement pour quelqu'un de
 * connecté : un visiteur anonyme n'a pas de progression à suivre, et lui
 * montrer une barre vide n'est pas une invitation, c'est un reproche.
 */
export default async function HalloweenSeasonBanner() {
  if (!isHalloweenTheme() || !isInSeason()) return null;

  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) return null;

  const { start, end } = seasonBounds();
  const attended = await countUserAttendanceBetween(
    userId,
    start.toJSDate(),
    end.toJSDate()
  );

  const done = Math.min(attended, SEASON_GOAL);
  const earned = done >= SEASON_GOAL;
  const t = await getTranslations("HalloweenSeason");

  return (
    <div
      data-print-hidden
      className="relative mb-6 flex flex-col gap-4 overflow-hidden rounded-xl border p-5 sm:flex-row sm:items-center sm:gap-5"
      style={{
        borderColor: "color-mix(in oklab, var(--pumpkin) 45%, transparent)",
        backgroundImage:
          "linear-gradient(100deg, color-mix(in oklab, var(--pumpkin) 16%, transparent), color-mix(in oklab, var(--wisp) 14%, transparent))",
      }}
    >
      {/* Le badge : éteint tant qu'il n'est pas gagné, allumé ensuite. */}
      <div
        className={`flex size-16 shrink-0 items-center justify-center rounded-full border-2 ${earned ? "halloween-lantern" : ""}`}
        style={{
          borderColor: "color-mix(in oklab, var(--pumpkin) 55%, transparent)",
          backgroundImage:
            "radial-gradient(circle at 50% 40%, color-mix(in oklab, var(--pumpkin) 32%, transparent), transparent 72%)",
        }}
      >
        <svg viewBox="0 0 48 48" className="size-9" aria-hidden="true">
          <path
            d="M24 8 L30 20 L43 22 L33.5 31 L36 44 L24 38 L12 44 L14.5 31 L5 22 L18 20 Z"
            fill={earned ? "var(--pumpkin)" : "none"}
            stroke="var(--pumpkin)"
            strokeWidth="2.6"
            strokeLinejoin="round"
          />
          <circle cx="24" cy="26" r="3.4" fill="var(--pumpkin)" />
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-xl font-bold tracking-tight">
            {earned ? t("earnedTitle") : t("title")}
          </span>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ background: "var(--pumpkin)", color: "var(--primary-foreground)" }}
          >
            {earned ? t("badgeName") : t("deadline", { day: end.day })}
          </span>
        </div>

        <p className="text-sm text-muted-foreground text-pretty">
          {earned ? t("earnedBody") : t("body", { goal: SEASON_GOAL })}
        </p>

        <div className="mt-3 flex items-center gap-3">
          {/*
            Les paliers sont décoratifs : le compte est déjà dit en toutes
            lettres juste à côté, un lecteur d'écran n'a pas à entendre trois
            fois « palier ».
          */}
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: SEASON_GOAL }, (_, i) => (
              <span
                key={i}
                className="h-1.5 w-9 rounded-full"
                style={{
                  background:
                    i < done
                      ? "var(--pumpkin)"
                      : "color-mix(in oklab, var(--foreground) 20%, transparent)",
                }}
              />
            ))}
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {t("progress", { done, goal: SEASON_GOAL })}
          </span>
        </div>
      </div>

      <Button asChild variant="outline" className="shrink-0 bg-card">
        <Link href={earned ? "/account/achievements" : "/events"}>
          {earned ? t("seeBadge") : t("findEvent")}
        </Link>
      </Button>
    </div>
  );
}
