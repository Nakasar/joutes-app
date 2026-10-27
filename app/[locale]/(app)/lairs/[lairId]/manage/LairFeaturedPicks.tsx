"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { Award, Flame, Info } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { cn } from "@/lib/utils.ts";
import { MAX_LAIR_PICKS } from "@/lib/events/highlights.ts";

import { setEventFeaturedAction } from "./events-actions.ts";

export type FeaturedPickRow = {
  id: string;
  name: string;
  startDateTime: string;
  gameName: string;
  featured: boolean;
  popular: boolean;
  registered: number;
  capacity?: number;
};

/**
 * « Mettre en avant » : le gérant choisit jusqu'à trois événements à venir.
 *
 * L'interrupteur répond tout de suite et revient en arrière si le serveur
 * refuse ; une fois les trois places prises, les autres interrupteurs se
 * grisent et la carte dit pourquoi, plutôt que de laisser un clic échouer.
 */
export default function LairFeaturedPicks({ lairId, events }: { lairId: string; events: FeaturedPickRow[] }) {
  const t = useTranslations("Lairs.manage.events.featured");
  const tMarques = useTranslations("EventHighlights");
  const locale = useLocale();
  const [picked, setPicked] = useState(() => new Set(events.filter((event) => event.featured).map((event) => event.id)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const full = picked.size >= MAX_LAIR_PICKS;
  // Le plus proche des choix passe « À la une » de la vitrine.
  const uneId = events.find((event) => picked.has(event.id))?.id;

  const toggle = (eventId: string, on: boolean) => {
    setError(null);
    const previous = new Set(picked);
    const next = new Set(picked);
    if (on) next.add(eventId);
    else next.delete(eventId);
    setPicked(next);

    startTransition(async () => {
      const result = await setEventFeaturedAction(lairId, eventId, on);
      if (!result.success) {
        setPicked(previous);
        setError(result.error === "LIMIT" ? t("limit", { max: MAX_LAIR_PICKS }) : t("error"));
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <Award className="text-primary size-5" aria-hidden />
            {t("title")}
          </CardTitle>
          <CardDescription className="max-w-2xl">{t("description", { max: MAX_LAIR_PICKS })}</CardDescription>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 font-mono text-xs",
            full ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {t("count", { count: picked.size, max: MAX_LAIR_PICKS })}
        </span>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {events.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">{t("empty")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {events.map((event) => {
              const on = picked.has(event.id);
              const start = DateTime.fromISO(event.startDateTime).setZone("Europe/Paris").setLocale(locale);
              return (
                <li key={event.id} className={cn("flex items-center gap-4 px-4 py-3", on && "bg-primary/5")}>
                  <div className="flex w-11 shrink-0 flex-col items-center">
                    <span className="text-muted-foreground font-mono text-[10px] uppercase">{start.toFormat("ccc")}</span>
                    <span className="text-lg leading-tight font-bold">{start.toFormat("d")}</span>
                    <span className="text-muted-foreground font-mono text-[10px] uppercase">{start.toFormat("LLL")}</span>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-sm font-semibold">{event.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {[
                        start.toFormat("HH'h'mm"),
                        event.gameName,
                        event.capacity
                          ? t("seats", { registered: event.registered, capacity: event.capacity })
                          : t("registered", { count: event.registered }),
                      ].join(" · ")}
                    </span>
                    {(event.id === uneId || event.popular) && (
                      <span className="flex flex-wrap gap-1.5">
                        {event.id === uneId && (
                          <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium">
                            <Award className="size-3 shrink-0" aria-hidden />
                            {t("une")}
                          </span>
                        )}
                        {event.popular && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-300"
                            title={t("alreadyPopular")}
                          >
                            <Flame className="size-3 shrink-0" aria-hidden />
                            {tMarques("popular")}
                          </span>
                        )}
                      </span>
                    )}
                  </div>

                  <label className="flex shrink-0 items-center gap-2 text-xs">
                    <span className={cn("hidden sm:inline", on ? "text-primary font-medium" : "text-muted-foreground")}>
                      {on ? t("on") : t("off")}
                    </span>
                    <Switch
                      checked={on}
                      disabled={pending || (!on && full)}
                      onCheckedChange={(checked) => toggle(event.id, checked)}
                      aria-label={t("toggle", { name: event.name })}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {(error || full) && (
          <p className={cn("flex items-center gap-2 text-xs", error ? "text-destructive" : "text-muted-foreground")}>
            <Info className="size-3.5 shrink-0" aria-hidden />
            {error ?? t("limit", { max: MAX_LAIR_PICKS })}
          </p>
        )}
        <p className="text-muted-foreground text-xs">{t("hint")}</p>
      </CardContent>
    </Card>
  );
}
