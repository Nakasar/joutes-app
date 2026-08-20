import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";

import { Link } from "@/i18n/navigation.ts";
import EventsCalendarClient from "@/components/EventsCalendarClient.tsx";
import type { Event } from "@/lib/types/Event";
import type { Lair } from "@/lib/types/Lair";

import EventsAgendaList from "./EventsAgendaList.tsx";
import EventsConferenceView from "./EventsConferenceView.tsx";
import { SidebarCard } from "./LairSidebar.tsx";
import { upcomingOf } from "./lair-data.ts";

/**
 * Les trois états d'une puce du calendrier.
 *
 * La légende reprend ce que le calendrier colore réellement — le statut d'un
 * événement, non son jeu. Une légende par jeu aurait été plus jolie, mais elle
 * aurait désigné des couleurs que la grille ne porte pas.
 */
const STATUS_LEGEND = [
  { key: "available", dot: "bg-emerald-500" },
  { key: "soldOut", dot: "bg-red-500" },
  { key: "cancelled", dot: "bg-muted-foreground/40" },
] as const;

/**
 * L'onglet « Agenda » : le calendrier du produit, dans la vitrine du lieu.
 *
 * Rien n'est changé à son fonctionnement — navigation de mois, vue liste,
 * filtre par jeu vivent déjà dans `EventsCalendarClient`, et l'URL en reste la
 * source de vérité. La vitrine n'ajoute qu'une légende.
 */
export default async function LairAgendaTab({
  lair,
  events,
  month,
  year,
  gameId,
}: {
  lair: Lair;
  events: Event[];
  month?: string;
  year?: string;
  gameId?: string;
}) {
  const t = await getTranslations("Lairs.portal.agenda");
  const mode = lair.options?.calendar?.mode ?? "CALENDAR";

  if (mode === "AGENDA") {
    return <EventsAgendaList events={events} />;
  }

  if (mode === "CONFERENCE") {
    return <EventsConferenceView events={events} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <EventsCalendarClient
        initialEvents={events}
        initialMonth={+(month ?? new Date().getMonth() + 1)}
        initialYear={+(year ?? new Date().getFullYear())}
        initialGameId={gameId || "all"}
        basePath={`/lairs/${lair.id}`}
        lairId={lair.id}
      />

      <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t pt-4 text-[13px] text-muted-foreground">
        {STATUS_LEGEND.map((entry) => (
          <li key={entry.key} className="flex items-center gap-2">
            <span className={`size-[9px] shrink-0 rounded-[3px] ${entry.dot}`} aria-hidden />
            {t(`legend.${entry.key}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Ce que le visiteur a déjà réservé ici.
 *
 * En tête de la colonne, et bordé de l'accent : sur une page d'agenda, la
 * première question d'un habitué est ce à quoi il s'est déjà engagé.
 */
export async function LairAgendaRegistrations({
  events,
  userId,
}: {
  events: Event[];
  userId: string | null;
}) {
  const registrations = userId
    ? upcomingOf(events).filter((event) => event.participants?.includes(userId))
    : [];

  if (registrations.length === 0) {
    return null;
  }

  const [t, locale] = await Promise.all([getTranslations("Lairs.portal.agenda"), getLocale()]);

  return (
    <SidebarCard title={t("yourRegistrations")} className="border-[var(--lair-accent-32)]">
      <ul className="flex flex-col gap-2.5 text-[13px]">
        {registrations.slice(0, 5).map((event) => {
          const start = DateTime.fromISO(event.startDateTime).setLocale(locale);

          return (
            <li key={event.id} className="flex items-baseline gap-2.5">
              <span className="font-mono text-[11px] whitespace-nowrap text-[var(--lair-accent-text)] uppercase">
                {start.toFormat("ccc d")}
              </span>
              <Link href={`/events/${event.id}`} className="truncate hover:underline">
                {event.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </SidebarCard>
  );
}

/** Le rythme habituel de la semaine, tel que le lieu le décrit. */
export async function LairAgendaRhythm({ lair }: { lair: Lair }) {
  const rhythm = lair.options?.about?.rhythm ?? [];

  if (rhythm.length === 0) {
    return null;
  }

  const t = await getTranslations("Lairs.portal.agenda");

  return (
    <SidebarCard title={t("rhythm")}>
      <dl className="flex flex-col gap-[7px] text-[13px]">
        {rhythm.map((entry) => (
          <div key={entry.label} className="flex justify-between gap-3">
            <dt className="text-foreground/80">{entry.label}</dt>
            <dd className="text-muted-foreground">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </SidebarCard>
  );
}
