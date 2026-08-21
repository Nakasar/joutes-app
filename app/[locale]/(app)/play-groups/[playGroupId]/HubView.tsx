import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { ArrowLeftRight, Calendar, Megaphone, Plus, Trophy } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { sortPlayGroupAnnouncements } from "@/lib/db/play-groups.ts";
import { getNextPlayGroupSession } from "@/lib/db/play-group-sessions.ts";
import { readPlayGroupResults } from "@/lib/db/play-group-results.ts";

import PlayGroupPollCard from "./PlayGroupPollCard.tsx";
import PlayGroupRsvpButtons from "./PlayGroupRsvpButtons.tsx";
import PlayGroupPlaceCard from "./PlayGroupPlaceCard.tsx";
import PlayGroupLiveSection from "./PlayGroupLiveSection.tsx";
import { viewHref } from "./views.ts";
import { readGroupTradeMatches } from "./trade-data.ts";
import {
  countPending,
  memberName,
  readGroupMembers,
  readGroupSessions,
  requirePlayGroup,
  requirePlayGroupMember,
} from "./group-data.ts";

/**
 * L'Établi : le hub d'un membre.
 *
 * Une seule question à laquelle il doit répondre d'un coup d'œil : qu'est-ce
 * qui m'attend ? D'où l'ordre des tuiles — ce qui demande une réponse d'abord
 * (sondage, direct, prochaine session), ce qui informe ensuite.
 */
export default async function HubView({ playGroupId }: { playGroupId: string }) {
  const [group, viewer, sessions, members, t] = await Promise.all([
    requirePlayGroup(playGroupId),
    requirePlayGroupMember(playGroupId),
    readGroupSessions(playGroupId),
    readGroupMembers(playGroupId),
    getTranslations("PlayGroups.hub"),
  ]);

  const memberNames = Object.fromEntries(members.map((member) => [member.userId, member.displayName]));
  const poll = sessions.find((session) => session.status === "poll");
  const lives = group.options?.lives ?? [];
  const pending = countPending(sessions, viewer.userId);

  return (
    <div className="flex flex-col gap-[18px]">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {pending > 0 ? t("pending", { count: pending }) : t("nothingPending")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {lives.length > 0 && (
            <Button variant="outline" size="sm" asChild>
              <Link href={viewHref(playGroupId, "showcase")}>
                <span className="size-1.5 rounded-full bg-red-500" aria-hidden />
                {t("liveCount", { count: lives.length })}
              </Link>
            </Button>
          )}
          <Button size="sm" asChild>
            <Link href={viewHref(playGroupId, "sessions")}>
              <Plus aria-hidden />
              {t("proposeSession")}
            </Link>
          </Button>
        </div>
      </header>

      {poll && (
        <PlayGroupPollCard
          playGroupId={playGroupId}
          session={poll}
          memberCount={members.length}
          authorName={memberName(members, poll.createdById)}
          currentUserId={viewer.userId}
          canManage={viewer.canManage}
        />
      )}

      <div className="grid gap-[18px] xl:grid-cols-2">
        <PlayGroupLiveSection
          playGroupId={playGroupId}
          lives={lives}
          memberNames={memberNames}
          currentUserId={viewer.userId}
          canManage={viewer.canManage}
        />

        <AnnouncementsTile playGroupId={playGroupId} />

        <NextSessionTile playGroupId={playGroupId} />

        <Suspense fallback={<TileSkeleton />}>
          <TradesTile playGroupId={playGroupId} />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <ResultsTile playGroupId={playGroupId} />
      </Suspense>
    </div>
  );
}

function TileSkeleton() {
  return <div className="h-48 animate-pulse rounded-xl border bg-card/60" aria-hidden />;
}

/** Les deux dernières annonces — la portée décide de la teinte, pas de l'ordre. */
async function AnnouncementsTile({ playGroupId }: { playGroupId: string }) {
  const [group, members, t, locale] = await Promise.all([
    requirePlayGroup(playGroupId),
    readGroupMembers(playGroupId),
    getTranslations("PlayGroups.hub.announcements"),
    getLocale(),
  ]);

  const announcements = sortPlayGroupAnnouncements(group.options?.announcements ?? []).slice(0, 2);

  return (
    <section className="flex flex-col gap-3.5 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Megaphone className="size-[18px] shrink-0 text-[var(--group-accent-text)]" aria-hidden />
        <h2 className="text-lg font-bold">{t("title")}</h2>
        <Link
          href={viewHref(playGroupId, "announcements")}
          className="ml-auto text-[13px] text-[var(--group-accent-text)] hover:underline"
        >
          {t("seeAll")}
        </Link>
      </div>

      {announcements.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("empty")}</p>
      ) : (
        announcements.map((announcement) => {
          const date = DateTime.fromISO(announcement.publishedAt).setLocale(locale);

          return (
            <article
              key={announcement.id}
              className={
                announcement.scope === "group"
                  ? "rounded-[10px] border border-[var(--group-accent-28)] bg-[image:var(--group-accent-sweep)] p-3.5"
                  : "rounded-[10px] border bg-background/40 p-3.5"
              }
            >
              <h3 className="text-sm font-semibold">{announcement.title}</h3>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                {[
                  memberName(members, announcement.authorId),
                  date.isValid ? date.toFormat("d LLLL") : null,
                  t(announcement.scope === "group" ? "scopeGroup" : "scopePublic"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </article>
          );
        })
      )}
    </section>
  );
}

/** La prochaine session confirmée, et la réponse du membre. */
async function NextSessionTile({ playGroupId }: { playGroupId: string }) {
  const [session, viewer, t, locale] = await Promise.all([
    getNextPlayGroupSession(playGroupId),
    requirePlayGroupMember(playGroupId),
    getTranslations("PlayGroups.hub.nextSession"),
    getLocale(),
  ]);

  const answer = session?.rsvps.find((rsvp) => rsvp.userId === viewer.userId)?.answer ?? null;
  const counts = {
    yes: session?.rsvps.filter((rsvp) => rsvp.answer === "yes").length ?? 0,
    maybe: session?.rsvps.filter((rsvp) => rsvp.answer === "maybe").length ?? 0,
    no: session?.rsvps.filter((rsvp) => rsvp.answer === "no").length ?? 0,
  };

  const starts = session?.startsAt ? DateTime.fromISO(session.startsAt).setLocale(locale) : null;
  const ends = session?.endsAt ? DateTime.fromISO(session.endsAt).setLocale(locale) : null;

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Calendar className="size-[18px] shrink-0 text-[var(--group-accent-text)]" aria-hidden />
        <h2 className="text-lg font-bold">{t("title")}</h2>
        <Link
          href={viewHref(playGroupId, "sessions")}
          className="ml-auto text-[13px] text-[var(--group-accent-text)] hover:underline"
        >
          {t("seeAll")}
        </Link>
      </div>

      {!session ? (
        <p className="text-[13px] text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <div>
            <h3 className="text-[17px] font-bold">{session.title}</h3>
            {starts?.isValid && (
              <p className="mt-1 font-mono text-[11px] tracking-[.06em] text-muted-foreground uppercase">
                {starts.toFormat("ccc d LLLL · HH'h'mm")}
                {ends?.isValid ? ` — ${ends.toFormat("HH'h'mm")}` : null}
              </p>
            )}
          </div>

          {session.place && <PlayGroupPlaceCard place={session.place} />}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <PlayGroupRsvpButtons playGroupId={playGroupId} sessionId={session.id} answer={answer} />
            <p className="text-[13px] text-muted-foreground">
              {t("counts", { yes: counts.yes, maybe: counts.maybe, no: counts.no })}
            </p>
          </div>
        </>
      )}
    </section>
  );
}

/** Les rapprochements souhaits ↔ ventes, trois au plus : le reste est dans la vue listes. */
async function TradesTile({ playGroupId }: { playGroupId: string }) {
  const [matches, members, t] = await Promise.all([
    readGroupTradeMatches(playGroupId),
    readGroupMembers(playGroupId),
    getTranslations("PlayGroups.hub.trades"),
  ]);

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <ArrowLeftRight className="size-[18px] shrink-0 text-[var(--group-accent-text)]" aria-hidden />
        <h2 className="text-lg font-bold">{t("title")}</h2>
        <Link
          href={viewHref(playGroupId, "lists")}
          className="ml-auto text-[13px] text-[var(--group-accent-text)] hover:underline"
        >
          {t("seeAll")}
        </Link>
      </div>

      {matches.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("empty")}</p>
      ) : (
        matches.slice(0, 3).map((match) => (
          <div
            key={`${match.cardId}-${match.seekerId}-${match.holderId}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border bg-background/40 px-3.5 py-2.5"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{match.name}</span>
            <span className="font-mono text-[11px] text-emerald-300">
              {t("seeks", {
                seeker: memberName(members, match.seekerId),
                holder: memberName(members, match.holderId),
              })}
            </span>
          </div>
        ))
      )}
    </section>
  );
}

/**
 * Les résultats en tournoi du groupe.
 *
 * Absente quand le groupe n'a rien à montrer : un groupe d'amis qui ne sort
 * jamais en tournoi n'a pas à porter trois zéros au milieu de son Établi.
 */
async function ResultsTile({ playGroupId }: { playGroupId: string }) {
  const [group, t] = await Promise.all([
    requirePlayGroup(playGroupId),
    getTranslations("PlayGroups.hub.results"),
  ]);

  const results = await readPlayGroupResults(group.members.map((member) => member.userId));
  if (results.tournamentsPlayed === 0) {
    return null;
  }

  const figures = [
    { key: "topEights", value: results.topEights },
    { key: "tournamentsPlayed", value: results.tournamentsPlayed },
    { key: "rankedMembers", value: results.rankedMembers },
  ] as const;

  return (
    <section className="flex flex-col gap-3.5 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Trophy className="size-[18px] shrink-0 text-[#E8B969]" aria-hidden />
        <h2 className="text-lg font-bold">{t("title")}</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {figures.map((figure) => (
          <div key={figure.key} className="rounded-[10px] border bg-background/40 p-3.5">
            <p className="font-mono text-[26px] leading-none font-extrabold text-[#E8B969]">{figure.value}</p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">{t(figure.key)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
