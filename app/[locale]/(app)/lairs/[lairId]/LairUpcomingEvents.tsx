"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { DateTime } from "luxon";
import { Calendar, Filter } from "lucide-react";

import { Link, useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import type { Event } from "@/lib/types/Event";

export type UpcomingEventsScope = "mine" | "all";

type LairUpcomingEventsProps = {
  lairId: string;
  events: Event[];
  /** Les jeux du lieu que le visiteur suit, par nom — la clé de jointure des événements. */
  followedGameNames: string[];
  /** La couleur de chaque jeu du lieu, pour le filet de gauche. */
  gameColors: Record<string, string>;
  /** L'événement à la une, mis en valeur dans la liste comme dans son bloc. */
  featuredEventId?: string;
  initialScope: UpcomingEventsScope;
  /** Le nombre de lignes affichées ; le reste renvoie vers l'agenda. */
  limit?: number;
};

/**
 * Les prochains événements du lieu, en lignes denses.
 *
 * La bascule « Mes jeux » / « Tous les jeux » filtre côté client — les
 * événements sont déjà là — et s'inscrit dans l'URL pour survivre au
 * rechargement. Elle démarre sur « Mes jeux » dès que le visiteur suit au
 * moins un des jeux du lieu : c'est le cadrage utile pour un habitué, et la
 * ligne sous la bascule dit toujours combien d'événements sont ainsi écartés,
 * pour qu'un filtre ne passe jamais pour un lieu sans programme.
 */
export default function LairUpcomingEvents({
  lairId,
  events,
  followedGameNames,
  gameColors,
  featuredEventId,
  initialScope,
  limit = 3,
}: LairUpcomingEventsProps) {
  const t = useTranslations("Lairs.portal.upcoming");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const scopeParam = searchParams.get("scope");
  const scope: UpcomingEventsScope =
    scopeParam === "mine" || scopeParam === "all" ? scopeParam : initialScope;

  const canFilter = followedGameNames.length > 0;

  const mine = useMemo(
    () => events.filter((event) => followedGameNames.includes(event.gameName)),
    [events, followedGameNames],
  );

  const visible = scope === "mine" && canFilter ? mine : events;
  const hidden = events.length - mine.length;

  const setScope = (next: UpcomingEventsScope) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("scope", next);
    router.replace(`/lairs/${lairId}?${params.toString()}`, { scroll: false });
  };

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[22px] font-bold">
          <Calendar className="size-[22px]" aria-hidden />
          {t("title")}
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          {canFilter && (
            <div
              role="group"
              aria-label={t("scopeLabel")}
              className="flex gap-0.5 rounded-lg border bg-background p-[3px]"
            >
              {(["mine", "all"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value)}
                  aria-pressed={scope === value}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs whitespace-nowrap transition-colors",
                    scope === value
                      ? "bg-[var(--lair-accent-16)] font-semibold text-[var(--lair-accent-text)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(value === "mine" ? "scopeMine" : "scopeAll")}
                </button>
              ))}
            </div>
          )}

          <Link
            href={`/lairs/${lairId}?tab=agenda`}
            className="text-[13px] whitespace-nowrap text-[var(--lair-accent-text)] hover:underline"
          >
            {t("seeAgenda")}
          </Link>
        </div>
      </div>

      {scope === "mine" && canFilter && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="size-3.5 shrink-0" aria-hidden />
          {t("filterExplanation", { games: followedGameNames.length, hidden })}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="rounded-[10px] border border-dashed p-6 text-center text-sm text-muted-foreground">
          {scope === "mine" && canFilter && events.length > 0 ? t("emptyForMyGames") : t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.slice(0, limit).map((event) => (
            <EventRow
              key={event.id}
              event={event}
              locale={locale}
              color={gameColors[event.gameName]}
              isFeatured={event.id === featuredEventId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function EventRow({
  event,
  locale,
  color,
  isFeatured,
}: {
  event: Event;
  locale: string;
  color?: string;
  isFeatured: boolean;
}) {
  const t = useTranslations("Lairs.portal.upcoming");
  const start = DateTime.fromISO(event.startDateTime).setLocale(locale);
  const end = DateTime.fromISO(event.endDateTime).setLocale(locale);

  const registered = event.registeredParticipantsCount ?? event.participants?.length ?? 0;
  const capacity = event.maxParticipants;
  const canJoin = event.allowJoin !== false && event.status === "available";

  const meta = [
    end.isValid ? `${start.toFormat("t")} — ${end.toFormat("t")}` : start.toFormat("t"),
    typeof event.price === "number"
      ? event.price > 0
        ? new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(event.price)
        : t("free")
      : null,
    event.gameName,
  ].filter(Boolean);

  const seats = capacity
    ? t("seats", { registered, capacity })
    : canJoin
      ? null
      : t("noRegistration");

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[10px] border bg-card px-4 py-3.5",
        isFeatured && "border-[var(--lair-accent-32)]",
      )}
    >
      <div className="flex w-11 shrink-0 flex-col items-center">
        <span
          className={cn(
            "font-mono text-[10px] uppercase",
            isFeatured ? "text-[var(--lair-accent-text)]" : "text-muted-foreground",
          )}
        >
          {start.toFormat("ccc")}
        </span>
        <span className={cn("text-lg font-bold", isFeatured && "text-[var(--lair-accent-text)]")}>
          {start.toFormat("d")}
        </span>
      </div>

      <span
        aria-hidden
        className="h-[34px] w-[3px] shrink-0 rounded-[2px]"
        style={{ background: isFeatured ? "var(--lair-accent)" : (color ?? "var(--muted-foreground)") }}
      />

      <div className="flex min-w-[12rem] flex-1 flex-col gap-0.5">
        <Link href={`/events/${event.id}`} className="text-[15px] font-semibold hover:underline">
          {event.name}
        </Link>
        <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p>
      </div>

      {seats && <span className="text-xs text-muted-foreground">{seats}</span>}

      <Button
        asChild
        size="sm"
        variant={isFeatured && canJoin ? "default" : "outline"}
        className={
          isFeatured && canJoin
            ? "bg-[var(--lair-accent)] text-[var(--lair-accent-foreground)] hover:bg-[var(--lair-accent)]/90"
            : undefined
        }
      >
        <Link href={canJoin ? `/events/${event.id}/join` : `/events/${event.id}`}>
          {canJoin ? t("register") : t("attend")}
        </Link>
      </Button>
    </li>
  );
}
