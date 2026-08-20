import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { Gamepad2 } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import type { Event } from "@/lib/types/Event";

/**
 * L'événement mis en avant par le lieu.
 *
 * Le visuel porte la pastille de date : la carte peut alors se lire de loin,
 * sans que le regard ait à traverser le texte pour savoir quand ça se passe.
 *
 * La jauge d'inscription n'apparaît que si l'événement a une capacité —
 * une barre sans dénominateur ne dit rien, et une barre pleine par défaut
 * dirait le contraire de la vérité.
 */
export default async function LairFeaturedEvent({ event }: { event: Event }) {
  const [t, locale] = await Promise.all([getTranslations("Lairs.portal.featured"), getLocale()]);

  const start = DateTime.fromISO(event.startDateTime).setLocale(locale);
  const registered = event.registeredParticipantsCount ?? event.participants?.length ?? 0;
  const capacity = event.maxParticipants;
  const ratio = capacity && capacity > 0 ? Math.min(1, registered / capacity) : null;
  const banner = event.game?.banner;

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[22px] font-bold">{t("title")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
      </div>

      <article className="flex flex-col overflow-hidden rounded-xl border border-[var(--lair-accent-32)] bg-card sm:flex-row">
        <div className="relative h-40 shrink-0 bg-muted sm:h-auto sm:w-[300px]">
          {banner ? (
            <Image src={banner} alt="" fill className="object-cover" sizes="300px" />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/40 to-purple-600/40">
              <Gamepad2 className="size-10 text-white/70" aria-hidden />
            </div>
          )}
          <div className="absolute inset-x-3 bottom-3 flex flex-col items-center rounded-lg bg-[rgba(10,8,5,.75)] py-2 backdrop-blur-sm">
            <span className="font-mono text-[10px] tracking-[.1em] text-[var(--lair-accent-text)] uppercase">
              {start.toFormat("ccc")}
            </span>
            <span className="text-[26px] leading-[1.1] font-bold text-white">{start.toFormat("d")}</span>
            <span className="font-mono text-[10px] text-white/70 uppercase">
              {start.toFormat("LLLL")} · {start.toFormat("t")}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--lair-accent-18)] px-2 py-0.5 font-mono text-[11px] text-[var(--lair-accent-text)]">
              {t("badge")}
            </span>
            <span className="text-xs text-muted-foreground">{event.gameName}</span>
          </div>

          <h3 className="text-[26px] leading-tight font-bold tracking-[-0.01em]">{event.name}</h3>

          {event.description && (
            <p className="max-w-xl text-sm leading-[1.55] text-pretty text-muted-foreground">
              {event.description}
            </p>
          )}

          {ratio !== null && (
            <div className="flex w-56 flex-col gap-1.5">
              <div className="h-[5px] overflow-hidden rounded-[3px] bg-white/10">
                <div
                  className="h-full rounded-[3px] bg-[var(--lair-accent)]"
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("registered", { registered, capacity: capacity as number })}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-1.5">
            {event.allowJoin !== false && event.status === "available" && (
              <Button
                asChild
                size="sm"
                className="bg-[var(--lair-accent)] text-[var(--lair-accent-foreground)] hover:bg-[var(--lair-accent)]/90"
              >
                <Link href={`/events/${event.id}/join`}>{t("register")}</Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href={`/events/${event.id}`}>{t("details")}</Link>
            </Button>
          </div>
        </div>
      </article>
    </section>
  );
}
