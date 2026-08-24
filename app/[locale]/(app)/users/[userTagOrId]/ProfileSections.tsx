import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { ExternalLink, Heart, Play, Tag, Trophy } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import GameMarkdown from "@/components/GameMarkdown.tsx";
import { AchievementIcon } from "@/components/AchievementIcon.tsx";
import { LiveBadge } from "@/components/users/LiveBadge.tsx";
import { getDeckCardPreviews } from "@/lib/db/decks.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { readLiveEmbed } from "@/lib/media/live-embed.ts";
import { userProfilePath } from "@/lib/users/handle.ts";

import ProfileContents from "./ProfileContents.tsx";
import PinnedDeckGrid from "./PinnedDeckGrid.tsx";
import {
  readProfileAchievements,
  readProfileContents,
  readProfileDecks,
  readProfileLists,
  readProfileLive,
  readProfileTradeMatches,
  readProfileViewer,
  requireProfile,
} from "./profile-data.ts";

/**
 * Les blocs de la vitrine.
 *
 * Chacun rend `null` quand il n'a rien à montrer : l'interrupteur du bloc ne
 * sert qu'à cacher ce qui existe, il n'a jamais eu à faire apparaître une carte
 * à moitié remplie. C'est la règle de la vitrine d'un lieu, reprise telle
 * quelle.
 */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[22px] font-bold">{children}</h2>;
}

/**
 * Le direct en cours.
 *
 * Rouge et hors de la couleur de la maison, comme partout ailleurs : un direct
 * est un état, pas une marque. Une vignette et non un lecteur intégré — une
 * `iframe` qui démarre toute seule sur une page qu'on parcourt coûte plus cher
 * que tout le reste de la page.
 */
export async function LiveSection({ userTagOrId }: { userTagOrId: string }) {
  const [live, t, locale, headerList] = await Promise.all([
    readProfileLive(userTagOrId),
    getTranslations("Users.profile.live"),
    getLocale(),
    headers(),
  ]);

  if (!live) {
    return null;
  }

  const embed = readLiveEmbed(live.url, headerList.get("host") ?? "localhost");
  const startedAt = DateTime.fromISO(live.startedAt).setLocale(locale);

  return (
    <section className="flex flex-col gap-3.5 rounded-xl border border-red-500/40 bg-red-500/5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <LiveBadge label={t("badge")} />
        <SectionTitle>{live.title ?? t("untitled")}</SectionTitle>
      </div>

      <p className="text-[13px] text-muted-foreground">
        {t("since", { relative: startedAt.toRelative() ?? t("justNow") })}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        {embed && (
          <a
            href={embed.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative aspect-video w-full max-w-[280px] shrink-0 overflow-hidden rounded-lg border bg-muted"
          >
            {/* Vignette servie par la plateforme : son hôte n'est pas déclaré
                dans `next.config.ts`, d'où la balise nue. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={embed.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="inline-flex size-14 items-center justify-center rounded-full bg-red-600 text-white transition-transform group-hover:scale-105">
                <Play className="size-6 translate-x-0.5 fill-current" aria-hidden />
              </span>
            </span>
          </a>
        )}

        <Button variant="outline" size="sm" asChild className="min-h-11 sm:min-h-0">
          <a href={live.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
            {embed ? t("openOn", { platform: embed.label }) : t("open")}
          </a>
        </Button>
      </div>
    </section>
  );
}

/** La description, rendue en markdown, et les pastilles de style de jeu. */
export async function AboutSection({ userTagOrId }: { userTagOrId: string }) {
  const [subject, locale, t] = await Promise.all([
    requireProfile(userTagOrId),
    getLocale(),
    getTranslations("Users.profile.about"),
  ]);

  const description = subject.user.description;
  const playStyles = subject.user.showcase?.playStyles ?? [];

  if (!description && playStyles.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3.5">
      <SectionTitle>{t("title")}</SectionTitle>

      {description && (
        <div className="max-w-[700px] text-[15px] leading-[1.7] text-pretty">
          <GameMarkdown markdown={description} gameSlug="" ruleLang={locale === "fr" ? "fr" : "en"} />
        </div>
      )}

      {playStyles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {playStyles.map((style) => (
            <Badge key={style} variant="secondary">
              {style}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}

/** Les decks publics, le deck épinglé en tête. */
export async function DecksSection({ userTagOrId }: { userTagOrId: string }) {
  const [decks, subject, viewer, t] = await Promise.all([
    readProfileDecks(userTagOrId),
    requireProfile(userTagOrId),
    readProfileViewer(userTagOrId),
    getTranslations("Users.profile.decks"),
  ]);

  if (decks.length === 0) {
    return null;
  }

  // Le jeu et l'image de carte vedette se lisent par deck. Le premier est mis
  // en cache par le dépôt ; la seconde interprète la liste de cartes, qui est
  // du texte libre — c'est au mieux approximatif, et c'est assez pour une
  // vignette.
  const cards = await Promise.all(
    decks.map(async (deck) => {
      const [game, previews] = await Promise.all([
        readGameBySlugOrId(deck.gameId),
        getDeckCardPreviews(deck, 1),
      ]);

      return {
        id: deck.id,
        name: deck.name,
        gameName: game?.name,
        image: previews[0]?.image,
        updatedAt: deck.updatedAt.toISOString(),
      };
    }),
  );

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <SectionTitle>{t("title")}</SectionTitle>
        <p className="text-[13px] text-muted-foreground">{t("count", { count: decks.length })}</p>
      </div>

      <PinnedDeckGrid
        decks={cards}
        pinnedDeckId={subject.user.showcase?.pinnedDeckId ?? null}
        canPin={viewer.isOwner}
      />
    </section>
  );
}

/** Les publications du compte, filtrables par genre. */
export async function PublicationsSection({ userTagOrId }: { userTagOrId: string }) {
  const [contents, subject, viewer, t] = await Promise.all([
    readProfileContents(userTagOrId),
    requireProfile(userTagOrId),
    readProfileViewer(userTagOrId),
    getTranslations("Users.profile.publications"),
  ]);

  if (contents.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <SectionTitle>{t("title")}</SectionTitle>
        {viewer.isOwner && (
          <Button variant="outline" size="sm" asChild className="ml-auto">
            <Link href="/account/contents">{t("manage")}</Link>
          </Button>
        )}
      </div>

      <ProfileContents
        contents={contents.map((content) => ({
          id: content.id,
          kind: content.kind,
          title: content.title,
          summary: content.summary,
          thumbnail: content.thumbnail,
          duration: content.duration,
          url: content.url,
          publishedAt: content.publishedAt,
        }))}
        profilePath={`/users/${encodeURIComponent(subject.user.displayName && subject.user.discriminator ? `${subject.user.displayName}${subject.user.discriminator}` : subject.user.id)}`}
      />
    </section>
  );
}

/**
 * Les succès, leur progression et leur total de points.
 *
 * Deux tailles pour un même bloc. Sur la vitrine, un aperçu de trois vignettes
 * et une tuile qui compte le reste — un profil n'a pas à dérouler vingt succès
 * avant de montrer ses decks. Sur l'onglet « Succès », **la liste entière**,
 * chacun avec sa description et sa date : la tuile de l'aperçu y mène, elle ne
 * comptait le reste que pour dire où il était.
 */
export async function AchievementsSection({
  userTagOrId,
  full = false,
}: {
  userTagOrId: string;
  full?: boolean;
}) {
  const [{ unlocked, total, points }, subject, locale, t] = await Promise.all([
    readProfileAchievements(userTagOrId),
    requireProfile(userTagOrId),
    getLocale(),
    getTranslations("Users.profile.achievements"),
  ]);

  if (unlocked.length === 0) {
    return null;
  }

  const shown = full ? unlocked : unlocked.slice(0, 3);
  const remaining = unlocked.length - shown.length;
  const percent = total > 0 ? Math.round((unlocked.length / total) * 100) : 0;

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <SectionTitle>{t("title")}</SectionTitle>
        <Badge variant="secondary" className="font-mono">
          <Trophy className="mr-1 size-3" aria-hidden />
          {t("points", { points })}
        </Badge>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-xs text-muted-foreground">
          {t("progress", { unlocked: unlocked.length, total })}
        </p>
        <div
          className="h-1.5 overflow-hidden rounded-[3px] bg-secondary"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("title")}
        >
          <div className="h-full rounded-[3px] bg-amber-500" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {full ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((achievement) => {
            // Une date que Mongo rend en chaîne illisible se tait plutôt que
            // d'écrire « Invalid DateTime » sous le nom du succès.
            const unlockedOn = achievement.unlockedAt
              ? DateTime.fromJSDate(new Date(achievement.unlockedAt)).setLocale(locale)
              : null;

            return (
              <li key={achievement.id} className="flex gap-3 rounded-[10px] border bg-card p-4">
                <AchievementIcon
                  icon={achievement.icon}
                  iconImage={achievement.iconImage}
                  name={achievement.name}
                  size={40}
                  className="shrink-0"
                />

                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[14px] leading-tight font-medium">{achievement.name}</span>

                  {achievement.description && (
                    <p className="text-[13px] leading-snug text-pretty text-muted-foreground">
                      {achievement.description}
                    </p>
                  )}

                  <p className="font-mono text-[11px] text-muted-foreground">
                    {t("pointsShort", { points: achievement.points })}
                    {unlockedOn?.isValid && (
                      <>
                        {" · "}
                        {t("unlockedOn", { date: unlockedOn.toLocaleString(DateTime.DATE_MED) })}
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {shown.map((achievement) => (
            <li
              key={achievement.id}
              className="flex flex-col items-center gap-2 rounded-[10px] border bg-card p-3 text-center"
            >
              <AchievementIcon
                icon={achievement.icon}
                iconImage={achievement.iconImage}
                name={achievement.name}
                size={48}
              />
              <span className="text-[13px] leading-tight font-medium">{achievement.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {t("pointsShort", { points: achievement.points })}
              </span>
            </li>
          ))}

          {remaining > 0 && (
            <li>
              <Link
                href={`${userProfilePath(subject.user)}?tab=achievements`}
                className="flex h-full items-center justify-center rounded-[10px] border border-dashed p-3 text-center text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {t("more", { count: remaining })}
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/**
 * Souhaits et ventes.
 *
 * Ce bloc ne se coupe pas depuis les réglages : sa visibilité se décide liste
 * par liste, sur chaque liste. C'est aussi pour cela qu'il s'affiche sur un
 * profil privé — `isPublic` n'a jamais conditionné ces deux-là.
 */
export async function TradeSection({ userTagOrId }: { userTagOrId: string }) {
  const [{ wishlists, sellList }, matches, subject, t] = await Promise.all([
    readProfileLists(userTagOrId),
    readProfileTradeMatches(userTagOrId),
    requireProfile(userTagOrId),
    getTranslations("Users.profile.trade"),
  ]);

  const hasSellList = Boolean(sellList && sellList.itemsCount > 0);

  if (wishlists.length === 0 && !hasSellList) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3.5">
      <SectionTitle>{t("title")}</SectionTitle>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {wishlists.length > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold">
              <Heart className="size-4 text-muted-foreground" aria-hidden />
              {t("wishlists")}
            </h3>

            <ul className="flex flex-col gap-2">
              {wishlists.map((wishlist) => (
                <li key={wishlist.id}>
                  <Link
                    href={`/wishlists/${wishlist.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">{wishlist.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {t("cards", { count: wishlist.itemsCount })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {matches.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/10 p-3">
                <p className="text-[13px] text-pretty">
                  {t("match", { count: matches.length, name: subject.displayName })}
                </p>
                <Button size="sm" variant="secondary" asChild className="self-start">
                  <Link href="/trade">{t("proposeTrade")}</Link>
                </Button>
              </div>
            )}
          </div>
        )}

        {hasSellList && sellList && (
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold">
              <Tag className="size-4 text-muted-foreground" aria-hidden />
              {t("sellList")}
            </h3>

            <p className="text-[13px] text-muted-foreground">
              {t("forSale", { count: sellList.itemsCount })}
            </p>

            <Button variant="outline" size="sm" asChild className="self-start">
              <Link href={`/sell-lists/${sellList.id}`}>{t("seeSellList")}</Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
