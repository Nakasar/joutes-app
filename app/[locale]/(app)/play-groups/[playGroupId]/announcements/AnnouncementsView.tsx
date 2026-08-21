import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { Globe, Lock } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { viewHref } from "../views.ts";
import { getPlayGroupById, sortPlayGroupAnnouncements } from "@/lib/db/play-groups.ts";
import { countPlayGroupFollowers } from "@/lib/db/play-groups.ts";

import AnnouncementComposer from "./AnnouncementComposer.tsx";
import AnnouncementCard from "./AnnouncementCard.tsx";
import { memberName, readGroupMembers, requirePlayGroup, requirePlayGroupMember } from "../group-data.ts";
export default async function AnnouncementsView({ playGroupId }: { playGroupId: string }) {
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
        <Link href={viewHref(playGroupId, "showcase")}>{t("seeShowcase")}</Link>
      </Button>
    </section>
  );
}
