import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { Home, MapPin, Repeat, Store } from "lucide-react";

import { getLairsByIds } from "@/lib/db/lairs.ts";
import { readPlayGroupPlaces } from "@/lib/db/play-group-sessions.ts";
import { getUserById } from "@/lib/db/users.ts";
import type { PlayGroupSession } from "@/lib/types/PlayGroupSession";

import PlayGroupPollCard from "../PlayGroupPollCard.tsx";
import PlayGroupRsvpButtons from "../PlayGroupRsvpButtons.tsx";
import PlayGroupPlaceCard from "../PlayGroupPlaceCard.tsx";
import NewSessionPanel, { type LairChoice } from "./NewSessionPanel.tsx";
import {
  memberName,
  readGroupGames,
  readGroupMembers,
  readGroupSessions,
  requirePlayGroup,
  requirePlayGroupMember,
} from "../group-data.ts";
export default async function SessionsView({ playGroupId }: { playGroupId: string }) {
  const [group, viewer, sessions, members, games, places, t] = await Promise.all([
    requirePlayGroup(playGroupId),
    requirePlayGroupMember(playGroupId),
    readGroupSessions(playGroupId),
    readGroupMembers(playGroupId),
    readGroupGames(playGroupId),
    readPlayGroupPlaces(playGroupId),
    getTranslations("PlayGroups.hub.sessions"),
  ]);

  const polls = sessions.filter((session) => session.status === "poll");
  const confirmed = sessions.filter((session) => session.status === "confirmed");

  return (
    <div className="grid gap-[26px] xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t("title")}</h1>
          <Suspense fallback={null}>
            <SessionCreation playGroupId={playGroupId} games={games} places={places} />
          </Suspense>
        </header>

        {polls.map((poll) => (
          <PlayGroupPollCard
            key={poll.id}
            playGroupId={playGroupId}
            session={poll}
            memberCount={group.members.length}
            authorName={memberName(members, poll.createdById)}
            currentUserId={viewer.userId}
            canManage={viewer.canManage}
          />
        ))}

        <h2 className="font-mono text-[11px] tracking-[.1em] text-muted-foreground uppercase">{t("confirmed")}</h2>

        {confirmed.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card/60 p-5 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          confirmed.map((session) => (
            <SessionCard key={session.id} playGroupId={playGroupId} session={session} userId={viewer.userId} />
          ))
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <RhythmCard playGroupId={playGroupId} />
        <PlacesCard places={places} />
      </aside>
    </div>
  );
}

/**
 * Les lieux Joutes proposés à la création.
 *
 * Deux sources, sans en inventer une troisième : ceux que le groupe fréquente
 * déjà, et ceux que le membre suit. Ouvrir la recherche à tout l'annuaire des
 * lieux ferait un sélecteur de plusieurs milliers d'entrées pour un groupe qui,
 * en pratique, tourne entre deux ou trois adresses.
 */
async function SessionCreation({
  playGroupId,
  games,
  places,
}: {
  playGroupId: string;
  games: { id: string; name: string }[];
  places: Awaited<ReturnType<typeof readPlayGroupPlaces>>;
}) {
  const [group, viewer] = await Promise.all([requirePlayGroup(playGroupId), requirePlayGroupMember(playGroupId)]);

  const user = viewer.userId ? await getUserById(viewer.userId) : null;
  const lairIds = [
    ...new Set(
      [
        group.options?.rhythm?.defaultPlace?.lairId,
        ...places.filter((entry) => entry.place.kind === "joutes").map((entry) => entry.place.lairId),
        ...(user?.lairs ?? []),
      ].filter((id): id is string => !!id),
    ),
  ];

  const lairs = await getLairsByIds(lairIds);
  const choices: LairChoice[] = lairs.map((lair) => ({ id: lair.id, name: lair.name, address: lair.address }));

  return (
    <NewSessionPanel
      playGroupId={playGroupId}
      games={games.map((game) => ({ id: game.id, name: game.name }))}
      lairs={choices}
      defaultPlace={group.options?.rhythm?.defaultPlace}
    />
  );
}

async function SessionCard({
  playGroupId,
  session,
  userId,
}: {
  playGroupId: string;
  session: PlayGroupSession;
  userId: string | null;
}) {
  const [t, locale] = await Promise.all([getTranslations("PlayGroups.hub.sessions"), getLocale()]);

  const starts = session.startsAt ? DateTime.fromISO(session.startsAt).setLocale(locale) : null;
  const ends = session.endsAt ? DateTime.fromISO(session.endsAt).setLocale(locale) : null;
  const answer = userId ? (session.rsvps.find((rsvp) => rsvp.userId === userId)?.answer ?? null) : null;

  const counts = {
    yes: session.rsvps.filter((rsvp) => rsvp.answer === "yes").length,
    maybe: session.rsvps.filter((rsvp) => rsvp.answer === "maybe").length,
    no: session.rsvps.filter((rsvp) => rsvp.answer === "no").length,
  };

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-xl border sm:flex-row ${session.eventId ? "border-[#E8B969]/45" : ""}`}
    >
      <div className="flex shrink-0 flex-row items-center justify-center gap-2 bg-[var(--group-accent-10)] px-4 py-3 sm:w-24 sm:flex-col sm:gap-0 sm:py-5">
        <p className="font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">
          {starts?.isValid ? starts.toFormat("ccc") : null}
        </p>
        <p className="text-[28px] leading-none font-extrabold">{starts?.isValid ? starts.toFormat("d") : "—"}</p>
        <p className="font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">
          {starts?.isValid ? starts.toFormat("LLL") : null}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 bg-card p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="text-[17px] font-bold">{session.title}</h3>
          <span
            className={
              session.eventId
                ? "rounded-[5px] bg-[#E8B969]/16 px-1.5 py-0.5 font-mono text-[10px] tracking-[.08em] text-[#E8B969] uppercase"
                : "rounded-[5px] bg-emerald-400/14 px-1.5 py-0.5 font-mono text-[10px] tracking-[.08em] text-emerald-300 uppercase"
            }
          >
            {t(session.eventId ? "badgeEvent" : "badgeConfirmed")}
          </span>
          {starts?.isValid && (
            <p className="ml-auto text-[13px] text-muted-foreground">
              {starts.toFormat("HH'h'mm")}
              {ends?.isValid ? ` — ${ends.toFormat("HH'h'mm")}` : null}
            </p>
          )}
        </div>

        {session.place && <PlayGroupPlaceCard place={session.place} />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">
            {t("counts", { yes: counts.yes, maybe: counts.maybe, no: counts.no })}
          </p>
          <PlayGroupRsvpButtons playGroupId={playGroupId} sessionId={session.id} answer={answer} />
        </div>
      </div>
    </article>
  );
}

async function RhythmCard({ playGroupId }: { playGroupId: string }) {
  const [group, t] = await Promise.all([
    requirePlayGroup(playGroupId),
    getTranslations("PlayGroups.hub.rhythm"),
  ]);

  const rhythm = group.options?.rhythm;

  return (
    <section className="flex flex-col gap-2.5 rounded-xl border bg-card p-5">
      <h2 className="text-base font-bold">{t("title")}</h2>
      <p className="text-[13px] text-muted-foreground">{t("description")}</p>

      {rhythm?.label ? (
        <p className="flex items-center gap-2.5 text-sm">
          <Repeat className="size-4 shrink-0 text-[var(--group-accent-text)]" aria-hidden />
          {rhythm.label}
        </p>
      ) : (
        <p className="text-[13px] text-muted-foreground">{t("empty")}</p>
      )}

      {rhythm?.defaultPlace && <PlayGroupPlaceCard place={rhythm.defaultPlace} />}
    </section>
  );
}

async function PlacesCard({ places }: { places: Awaited<ReturnType<typeof readPlayGroupPlaces>> }) {
  const t = await getTranslations("PlayGroups.hub.places");

  if (places.length === 0) {
    return null;
  }

  const ICONS = { joutes: Store, free: MapPin, member: Home } as const;

  return (
    <section className="flex flex-col gap-2.5 rounded-xl border bg-card p-5">
      <h2 className="text-base font-bold">{t("title")}</h2>

      {places.map((entry) => {
        const Icon = ICONS[entry.place.kind];

        return (
          <div
            className="flex flex-wrap items-center gap-x-2.5 gap-y-1"
            key={`${entry.place.kind}-${entry.place.lairId ?? entry.place.label}`}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{entry.place.label ?? t("unnamed")}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{t("sessionCount", { count: entry.count })}</p>
            </div>
            <span className="font-mono text-[10px] tracking-[.08em] text-muted-foreground uppercase">
              {t(entry.place.kind === "joutes" ? "badgeLair" : "badgeFree")}
            </span>
          </div>
        );
      })}
    </section>
  );
}
