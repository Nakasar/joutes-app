import { Suspense } from "react";
import Image from "next/image";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { ArrowLeft, Eye, Globe, Repeat, Trophy, Users } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import ReportButton from "@/components/ReportButton.tsx";
import {
  countPlayGroupFollowers,
  isFollowingPlayGroup,
  sortPlayGroupAnnouncements,
} from "@/lib/db/play-groups.ts";
import { readPlayGroupResults } from "@/lib/db/play-group-results.ts";
import { readPlayGroupAccent } from "@/lib/play-groups/theme.ts";
import { readLiveEmbed } from "@/lib/media/live-embed.ts";
import { externalUrl } from "@/lib/lairs/urls.ts";
import { mergeContents } from "@/lib/content/items.ts";
import { listPublicContentsByAuthors } from "@/lib/db/user-contents.ts";
import { userProfilePath } from "@/lib/users/handle.ts";
import { viewHref } from "../views.ts";

import ShowcaseLives, { type ShowcaseLive } from "./ShowcaseLives.tsx";
import ShowcaseContents, { type ShowcaseContent } from "./ShowcaseContents.tsx";
import FollowGroupButton from "./FollowGroupButton.tsx";
import PlayGroupPlaceCard from "../PlayGroupPlaceCard.tsx";
import { readElapsed } from "../PlayGroupLiveSection.tsx";
import {
  memberName,
  readGroupGames,
  readGroupMembers,
  readGroupViewer,
  requirePlayGroup,
  sortContents,
} from "../group-data.ts";

/**
 * La vitrine publique d'un groupe.
 *
 * Vue par défaut et unique d'un visiteur ; un membre y accède depuis le rail
 * et voit alors un bandeau d'aperçu, sans rail — la vitrine doit se montrer
 * exactement telle qu'un visiteur la reçoit, sinon l'aperçu ne sert à rien.
 *
 * Rien de privé n'y passe : ni sondages, ni sessions internes, ni activité
 * nominative. Les annonces n'y arrivent que si leur portée est publique, et la
 * page le dit en toutes lettres.
 */
export default async function ShowcaseView({ playGroupId }: { playGroupId: string }) {
  const group = await requirePlayGroup(playGroupId);
  const accent = readPlayGroupAccent(group);

  return (
    <div className="play-group-theme min-h-screen" style={accent.style}>
      <Suspense fallback={null}>
        <MemberPreviewBanner playGroupId={playGroupId} />
      </Suspense>

      <ShowcaseHero playGroupId={playGroupId} />

      <div className="container mx-auto max-w-7xl px-4 pt-8 pb-11 lg:px-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-[34px]">
            <Suspense fallback={null}>
              <LivesSection playGroupId={playGroupId} />
            </Suspense>

            <Suspense fallback={null}>
              <ContentsSection playGroupId={playGroupId} />
            </Suspense>

            <Suspense fallback={null}>
              <PublicNewsSection playGroupId={playGroupId} />
            </Suspense>
          </div>

          <aside className="flex flex-col gap-4">
            <Suspense fallback={null}>
              <RhythmCard playGroupId={playGroupId} />
            </Suspense>

            <Suspense fallback={null}>
              <GamesCard playGroupId={playGroupId} />
            </Suspense>

            <Suspense fallback={null}>
              <PalmaresCard playGroupId={playGroupId} />
            </Suspense>

            <Suspense fallback={null}>
              <FollowCard playGroupId={playGroupId} />
            </Suspense>

            <Suspense fallback={null}>
              <MembersOnlyCard playGroupId={playGroupId} />
            </Suspense>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Le bandeau d'aperçu : un membre doit savoir qu'il regarde la page d'un visiteur. */
async function MemberPreviewBanner({ playGroupId }: { playGroupId: string }) {
  const [viewer, t] = await Promise.all([
    readGroupViewer(playGroupId),
    getTranslations("PlayGroups.showcase"),
  ]);

  if (!viewer.isMember) {
    return null;
  }

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b bg-background/95 px-4 py-2.5 backdrop-blur lg:px-10">
      <Eye className="size-4 shrink-0 text-cyan-300" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">{t("previewNotice")}</p>
      <Button variant="outline" size="sm" asChild>
        <Link href={viewHref(playGroupId, "hub")}>
          <ArrowLeft aria-hidden />
          {t("backToHub")}
        </Link>
      </Button>
    </div>
  );
}

async function ShowcaseHero({ playGroupId }: { playGroupId: string }) {
  const [group, t] = await Promise.all([requirePlayGroup(playGroupId), getTranslations("PlayGroups.showcase")]);

  const theme = group.options?.theme;
  const lives = group.options?.lives ?? [];
  const links = group.options?.links ?? [];

  return (
    <div className="relative h-60 w-full bg-gradient-to-br from-primary/80 to-purple-600/80 md:h-[240px]">
      {theme?.banner ? (
        <img src={theme.banner} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
      ) : null}

      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(8,6,4,.92)_12%,rgba(8,6,4,.35)_60%,rgba(8,6,4,.15))]" />

      <div className="absolute inset-x-0 bottom-0">
        <div className="container mx-auto flex max-w-7xl flex-wrap items-end gap-5 px-4 pb-6 lg:px-10">
          {theme?.logo && (
            <div className="hidden size-[84px] shrink-0 overflow-hidden rounded-[14px] border border-[var(--group-accent-40)] bg-black/40 sm:block">
              {/* `next/image` refuserait l'hôte : l'emblème est une URL saisie
                  par le groupe, comme la bannière juste au-dessus. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={theme.logo} alt="" className="size-full object-cover" />
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-[-0.02em] text-white sm:text-4xl md:text-[40px]">
                {group.name}
              </h1>
              {lives.length > 0 && (
                <span className="inline-flex shrink-0 items-center gap-[7px] rounded-full bg-red-500 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[.1em] text-white uppercase">
                  <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden />
                  {t("liveCount", { count: lives.length })}
                </span>
              )}
            </div>

            {(theme?.tagline || group.description) && (
              <p className="max-w-2xl text-sm text-pretty text-white/80">{theme?.tagline ?? group.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
              <Suspense fallback={<div className="h-8 w-32 animate-pulse rounded-md bg-white/20" aria-hidden />}>
                <FollowAction playGroupId={playGroupId} />
              </Suspense>

              {links.map((link) => {
                const href = externalUrl(link.url);
                if (!href) {
                  return null;
                }

                return (
                  <a
                    key={`${link.type}-${link.url}`}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-white/25 px-2.5 py-1.5 text-[13px] text-white/90 transition-colors hover:bg-white/10"
                  >
                    {link.label ?? t(`links.${link.type}`)}
                  </a>
                );
              })}

              <ReportButton contentType="play-group" contentId={playGroupId} variant="outline" size="sm" withLabel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function FollowAction({ playGroupId }: { playGroupId: string }) {
  const [viewer, followers] = await Promise.all([
    readGroupViewer(playGroupId),
    countPlayGroupFollowers(playGroupId),
  ]);

  const following = viewer.userId ? await isFollowingPlayGroup(playGroupId, viewer.userId) : false;

  return (
    <FollowGroupButton
      playGroupId={playGroupId}
      isFollowing={following}
      followersCount={followers}
      isAuthenticated={!!viewer.userId}
    />
  );
}

async function LivesSection({ playGroupId }: { playGroupId: string }) {
  const [group, members, t, locale, requestHeaders] = await Promise.all([
    requirePlayGroup(playGroupId),
    readGroupMembers(playGroupId),
    getTranslations("PlayGroups.showcase.live"),
    getLocale(),
    headers(),
  ]);

  const host = requestHeaders.get("host") ?? "localhost";
  const games = await readGroupGames(playGroupId);
  const gameById = new Map(games.map((game) => [game.id, game.name]));

  const lives: ShowcaseLive[] = (group.options?.lives ?? [])
    .map((live): ShowcaseLive | null => {
      const embed = readLiveEmbed(live.url, host);
      if (!embed) {
        return null;
      }

      const streamer = memberName(members, live.memberId);
      const duration = readElapsed(live.startedAt, locale);

      return {
        id: live.id,
        title: live.title ? `${streamer} — ${live.title}` : streamer,
        streamer,
        gameName: live.gameId ? gameById.get(live.gameId) : undefined,
        viewers: live.viewers,
        since: duration ? t("since", { duration }) : undefined,
        embedUrl: embed.embedUrl,
        channelUrl: embed.channelUrl,
        label: embed.label,
        platform: embed.platform === "twitch" ? "Twitch" : "YouTube",
      };
    })
    .filter((live): live is ShowcaseLive => live !== null);

  if (lives.length === 0) {
    return null;
  }

  return <ShowcaseLives lives={lives} groupName={group.name} />;
}

/**
 * Ce que le groupe publie, et ce que ses membres publient publiquement.
 *
 * Le contenu d'un membre remonte ici **s'il est public**, et seulement à ce
 * titre : un brouillon n'apparaît nulle part, ni sur sa propre vitrine ni sur
 * celle de ses groupes. Une seule requête pour toute la liste des membres —
 * une par membre coûterait autant qu'il y a de monde dans le groupe.
 */
async function ContentsSection({ playGroupId }: { playGroupId: string }) {
  const [group, members, locale] = await Promise.all([
    requirePlayGroup(playGroupId),
    readGroupMembers(playGroupId),
    getLocale(),
  ]);

  const memberContents = await listPublicContentsByAuthors(
    members.map((member) => member.userId),
  );

  const label = (publishedAt: string) => {
    const date = DateTime.fromISO(publishedAt).setLocale(locale);
    return date.isValid ? date.toFormat("d LLLL yyyy") : null;
  };

  const owned: ShowcaseContent[] = sortContents(group.options?.contents ?? []).map((content) => ({
    id: content.id,
    kind: content.kind,
    title: content.title,
    summary: content.summary,
    thumbnail: content.thumbnail,
    duration: content.duration,
    // Un article se lit sur Joutes ; une vidéo et un replay renvoient à leur
    // plateforme, où le lecteur est chez lui.
    href: content.kind === "article" ? viewHref(playGroupId, "showcase", { article: content.id }) : undefined,
    url: content.kind === "article" ? undefined : externalUrl(content.url) ?? undefined,
    publishedAt: content.publishedAt,
    publishedLabel: label(content.publishedAt),
  }));

  const fromMembers: ShowcaseContent[] = memberContents.map((content) => ({
    id: content.id,
    kind: content.kind,
    title: content.title,
    summary: content.summary,
    thumbnail: content.thumbnail,
    duration: content.duration,
    // L'article d'un membre se lit sur **son** profil : c'est là qu'il est
    // signé, et c'est là que son auteur peut le corriger.
    href:
      content.kind === "article"
        ? `${userProfilePath({ id: content.authorId })}?tab=publications&article=${content.id}`
        : undefined,
    url: content.kind === "article" ? undefined : (externalUrl(content.url) ?? undefined),
    publishedAt: content.publishedAt,
    publishedLabel: label(content.publishedAt),
    authorName: memberName(members, content.authorId),
  }));

  const contents = mergeContents(owned, fromMembers);

  if (contents.length === 0) {
    return null;
  }

  return <ShowcaseContents contents={contents} />;
}

/** Les actualités : uniquement les annonces marquées publiques. */
async function PublicNewsSection({ playGroupId }: { playGroupId: string }) {
  const [group, members, t, locale] = await Promise.all([
    requirePlayGroup(playGroupId),
    readGroupMembers(playGroupId),
    getTranslations("PlayGroups.showcase.news"),
    getLocale(),
  ]);

  const news = sortPlayGroupAnnouncements(group.options?.announcements ?? []).filter(
    (announcement) => announcement.scope === "public",
  );

  if (news.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-[22px] font-bold">{t("title")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {news.map((announcement) => {
          const date = DateTime.fromISO(announcement.publishedAt).setLocale(locale);

          return (
            <article key={announcement.id} className="flex flex-col gap-2 rounded-xl border bg-card p-5">
              <h3 className="text-base font-semibold">{announcement.title}</h3>
              {announcement.body && (
                <p className="text-[13px] leading-[1.55] text-pretty text-muted-foreground">{announcement.body}</p>
              )}
              <p className="font-mono text-[11px] text-muted-foreground">
                {[memberName(members, announcement.authorId), date.isValid ? date.toFormat("d LLLL") : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

async function RhythmCard({ playGroupId }: { playGroupId: string }) {
  const [group, t] = await Promise.all([
    requirePlayGroup(playGroupId),
    getTranslations("PlayGroups.showcase.rhythm"),
  ]);

  const rhythm = group.options?.rhythm;
  if (!rhythm?.label && !rhythm?.defaultPlace) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2.5 rounded-xl border bg-card p-5">
      <h2 className="text-base font-bold">{t("title")}</h2>

      {rhythm.label && (
        <p className="flex items-center gap-2.5 text-sm">
          <Repeat className="size-4 shrink-0 text-[var(--group-accent-text)]" aria-hidden />
          {rhythm.label}
        </p>
      )}

      {rhythm.defaultPlace && <PlayGroupPlaceCard place={rhythm.defaultPlace} />}

      <p className="font-mono text-[11px] text-muted-foreground">{t("privateNotice")}</p>
    </section>
  );
}

async function GamesCard({ playGroupId }: { playGroupId: string }) {
  const [games, t] = await Promise.all([
    readGroupGames(playGroupId),
    getTranslations("PlayGroups.showcase.games"),
  ]);

  if (games.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <h2 className="text-base font-bold">{t("title")}</h2>

      <div className="grid grid-cols-2 gap-3">
        {games.map((game) => (
          <Link
            key={game.id}
            href={`/games/${game.slug}`}
            className="relative flex h-[74px] items-end overflow-hidden rounded-[10px] border bg-muted p-2.5 transition-shadow hover:shadow-lg"
          >
            {game.banner && (
              <Image src={game.banner} alt="" fill className="object-cover opacity-40" sizes="160px" />
            )}
            <span className="relative text-[13px] font-semibold">{game.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Le palmarès, masqué tant que le groupe n'a pas de résultats. */
async function PalmaresCard({ playGroupId }: { playGroupId: string }) {
  const [group, t] = await Promise.all([
    requirePlayGroup(playGroupId),
    getTranslations("PlayGroups.showcase.palmares"),
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
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Trophy className="size-[18px] shrink-0 text-[#E8B969]" aria-hidden />
        <h2 className="text-base font-bold">{t("title")}</h2>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {figures.map((figure) => (
          <div key={figure.key} className="rounded-[10px] border bg-background/40 p-3">
            <p className="font-mono text-[22px] leading-none font-extrabold text-[#E8B969]">{figure.value}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{t(figure.key)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

async function FollowCard({ playGroupId }: { playGroupId: string }) {
  const [group, followers, t] = await Promise.all([
    requirePlayGroup(playGroupId),
    countPlayGroupFollowers(playGroupId),
    getTranslations("PlayGroups.showcase"),
  ]);

  const links = group.options?.links ?? [];
  if (links.length === 0 && followers === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2.5 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Globe className="size-[18px] shrink-0 text-[var(--group-accent-text)]" aria-hidden />
        <h2 className="text-base font-bold">{t("followTitle")}</h2>
      </div>

      <p className="text-[13px] text-muted-foreground">{t("followerCount", { count: followers })}</p>

      {links.map((link) => {
        const href = externalUrl(link.url);
        if (!href) {
          return null;
        }

        return (
          <a
            key={`${link.type}-${link.url}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] text-[var(--group-accent-text)] hover:underline"
          >
            {link.label ?? t(`links.${link.type}`)}
          </a>
        );
      })}
    </section>
  );
}

/** Ce qui est réservé aux membres — pour un visiteur seulement. */
async function MembersOnlyCard({ playGroupId }: { playGroupId: string }) {
  const [viewer, t] = await Promise.all([
    readGroupViewer(playGroupId),
    getTranslations("PlayGroups.showcase.membersOnly"),
  ]);

  if (viewer.isMember) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2.5 rounded-xl border border-dashed bg-card/60 p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Users className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="text-base font-bold">{t("title")}</h2>
      </div>

      <ul className="flex list-inside list-disc flex-col gap-1 text-[13px] text-muted-foreground">
        <li>{t("sessions")}</li>
        <li>{t("announcements")}</li>
        <li>{t("lists")}</li>
        <li>{t("collection")}</li>
      </ul>

      <p className="text-[13px] text-muted-foreground">{t("joinNotice")}</p>
    </section>
  );
}
