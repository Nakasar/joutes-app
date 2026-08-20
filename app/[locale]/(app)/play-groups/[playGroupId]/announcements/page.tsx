import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { Globe, Lock } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { getPlayGroupById, sortPlayGroupAnnouncements } from "@/lib/db/play-groups.ts";
import { countPlayGroupFollowers } from "@/lib/db/play-groups.ts";
import { PlayGroupScreenSkeleton } from "@/components/play-groups/PlayGroupSkeletons.tsx";

import PlayGroupShell from "../PlayGroupShell.tsx";
import AnnouncementComposer from "./AnnouncementComposer.tsx";
import AnnouncementCard from "./AnnouncementCard.tsx";
import { memberName, readGroupMembers, requirePlayGroup, requirePlayGroupMember } from "../group-data.ts";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ playGroupId: string }>;
}): Promise<Metadata> {
  const { playGroupId } = await params;
  const t = await getTranslations("PlayGroups.hub.announcements");

  await connection();
  const group = await getPlayGroupById(playGroupId);

  return { title: group ? t("metadataTitle", { group: group.name }) : t("title") };
}

/**
 * Les annonces du groupe.
 *
 * Toutes sont listées ici, quelle que soit leur portée : c'est la vitrine qui
 * filtre, pas le hub. Un membre doit pouvoir relire ce que le groupe a rendu
 * public sans changer de page.
 */
export default function PlayGroupAnnouncementsPage({ params }: { params: Promise<{ playGroupId: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-6 lg:px-8">
          <PlayGroupScreenSkeleton rows={3} />
        </div>
      }
    >
      <AnnouncementsView params={params} />
    </Suspense>
  );
}

async function AnnouncementsView({ params }: { params: Promise<{ playGroupId: string }> }) {
  const { playGroupId } = await params;

  return (
    <PlayGroupShell playGroupId={playGroupId} active="announcements">
      <AnnouncementsContent playGroupId={playGroupId} />
    </PlayGroupShell>
  );
}

async function AnnouncementsContent({ playGroupId }: { playGroupId: string }) {
  const [group, viewer, members, t, locale] = await Promise.all([
    requirePlayGroup(playGroupId),
    requirePlayGroupMember(playGroupId),
    readGroupMembers(playGroupId),
    getTranslations("PlayGroups.hub.announcements"),
    getLocale(),
  ]);

  const announcements = sortPlayGroupAnnouncements(group.options?.announcements ?? []);
  const publicCount = announcements.filter((item) => item.scope === "public").length;

  return (
    <div className="grid gap-[26px] xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <header className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("summary", { count: announcements.length, publicCount })}
          </p>
        </header>

        <AnnouncementComposer playGroupId={playGroupId} canPublish={viewer.canManage} />

        {announcements.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card/60 p-5 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          announcements.map((announcement) => {
            const date = DateTime.fromISO(announcement.publishedAt).setLocale(locale);

            return (
              <AnnouncementCard
                key={announcement.id}
                playGroupId={playGroupId}
                announcement={announcement}
                authorName={memberName(members, announcement.authorId)}
                publishedLabel={date.isValid ? date.toFormat("d LLLL") : null}
                canManage={viewer.canManage}
              />
            );
          })
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <Suspense fallback={null}>
          <ScopeCard playGroupId={playGroupId} memberCount={group.members.length} />
        </Suspense>
      </aside>
    </div>
  );
}

/** Le rappel des deux portées, avec les chiffres réels des deux publics. */
async function ScopeCard({ playGroupId, memberCount }: { playGroupId: string; memberCount: number }) {
  const [followers, t] = await Promise.all([
    countPlayGroupFollowers(playGroupId),
    getTranslations("PlayGroups.hub.announcements"),
  ]);

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <h2 className="text-base font-bold">{t("scopeTitle")}</h2>

      <p className="flex gap-2.5 text-[13px] text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold text-foreground">{t("scopeGroup")}</strong>
          {" — "}
          {t("scopeGroupHint", { count: memberCount })}
        </span>
      </p>

      <p className="flex gap-2.5 text-[13px] text-muted-foreground">
        <Globe className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold text-foreground">{t("scopePublic")}</strong>
          {" — "}
          {t("scopePublicHint", { count: followers })}
        </span>
      </p>

      <Button variant="outline" size="sm" className="self-start" asChild>
        <Link href={`/play-groups/${playGroupId}/showcase`}>{t("seeShowcase")}</Link>
      </Button>
    </section>
  );
}
