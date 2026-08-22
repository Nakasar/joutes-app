import { Suspense, type ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { ImagePlus, Lock, MapPin } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { PlanBadge } from "@/components/PlanBadge.tsx";
import { StatusBadge } from "@/components/StatusBadge.tsx";
import { LiveBadge } from "@/components/users/LiveBadge.tsx";
import { ProfileAvatar } from "@/components/users/ProfileAvatar.tsx";

import ProfileActions from "./ProfileActions.tsx";
import {
  readFollowersCount,
  readProfileBadges,
  readProfileLists,
  readProfileLive,
  readProfileViewer,
  requireProfile,
} from "./profile-data.ts";

/**
 * La bannière du profil, son identité, et de quoi agir.
 *
 * Le dégradé remonte du bas — opaque sous le texte, presque transparent en
 * haut — pour que le pseudonyme tienne sur n'importe quelle bannière sans
 * voiler l'image entière. Même recette que la vitrine d'un lieu, et pour la
 * même raison.
 *
 * L'avatar remonte sur la bannière (`-mt-*`) : c'est ce qui rattache l'identité
 * à l'image plutôt que de les empiler comme deux blocs sans rapport.
 */
export default async function ProfileHero({ userTagOrId }: { userTagOrId: string }) {
  const [subject, badges, t] = await Promise.all([
    requireProfile(userTagOrId),
    readProfileBadges(userTagOrId),
    getTranslations("Users.profile"),
  ]);

  const banner = subject.user.showcase?.banner;

  return (
    <div>
      <div className="relative h-[132px] w-full bg-gradient-to-br from-primary/25 to-purple-600/25 md:h-[210px]">
        {banner ? (
          // `next/image` refuserait l'hôte : l'URL vient du compte.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={banner}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        ) : null}

        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(8,6,4,.92)_12%,rgba(8,6,4,.35)_60%,rgba(8,6,4,.15))]" />

        <Suspense fallback={null}>
          <AddBannerCallToAction userTagOrId={userTagOrId} hasBanner={Boolean(banner)} />
        </Suspense>
      </div>

      <div className="container mx-auto max-w-7xl px-4 lg:px-10">
        <div className="-mt-[38px] flex flex-col gap-4 md:-mt-[52px] md:flex-row md:items-end">
          <ProfileAvatar
            src={subject.avatar}
            name={subject.displayName}
            plan={badges.plan}
            size={84}
            className="md:hidden"
          />
          <ProfileAvatar
            src={subject.avatar}
            name={subject.displayName}
            plan={badges.plan}
            size={112}
            className="hidden md:inline-flex"
          />

          <div className="flex min-w-0 flex-1 flex-col gap-2 pb-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.02em] md:text-[38px]">
                {subject.displayName}
                {subject.discriminator && (
                  <span className="text-[18px] font-semibold text-muted-foreground md:text-[26px]">
                    #{subject.discriminator}
                  </span>
                )}
              </h1>

              {!subject.isPublic && (
                <Lock
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-label={t("private.badge")}
                />
              )}

              {/* Badges et statuts restent sur un profil privé : une marque de
                  reconnaissance posée par l'équipe n'est pas du contenu. */}
              <PlanBadge plan={badges.plan} />
              {badges.statuses.map((status) => (
                <StatusBadge key={status.id} status={status} />
              ))}

              <Suspense fallback={null}>
                <LivePill userTagOrId={userTagOrId} />
              </Suspense>
            </div>

            <Suspense fallback={<p className="h-5" />}>
              <ProfileMetaLine userTagOrId={userTagOrId} />
            </Suspense>
          </div>

          <Suspense
            fallback={<div className="h-11 w-48 animate-pulse rounded-md bg-muted" aria-hidden />}
          >
            <ProfileHeroActions userTagOrId={userTagOrId} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/** « ville · membre depuis … · N abonnés » */
async function ProfileMetaLine({ userTagOrId }: { userTagOrId: string }) {
  const [subject, followers, locale, t] = await Promise.all([
    requireProfile(userTagOrId),
    readFollowersCount(userTagOrId),
    getLocale(),
    getTranslations("Users.profile"),
  ]);

  // La ville n'apparaît que si le compte l'a demandé, et jamais plus précise
  // que la commune : une position renseignée pour trouver des lieux proches
  // n'est pas une adresse qu'on a accepté de publier.
  const city = subject.user.showcase?.showCity ? subject.user.location?.city : undefined;

  const since = subject.user.createdAt
    ? DateTime.fromISO(subject.user.createdAt).setLocale(locale).toFormat("LLLL yyyy")
    : null;

  // Les points de séparation ne se posent qu'entre deux morceaux présents :
  // écrits en dur, un profil sans ville en afficherait un devant son ancienneté.
  const parts: { key: string; node: ReactNode }[] = [];

  if (city) {
    parts.push({
      key: "city",
      node: (
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          {city}
        </span>
      ),
    });
  }

  if (since) {
    parts.push({ key: "since", node: t("meta.memberSince", { date: since }) });
  }

  parts.push({ key: "followers", node: t("meta.followers", { count: followers }) });

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      {parts.map((part, index) => (
        <span key={part.key} className="inline-flex items-center gap-2">
          {index > 0 && <span aria-hidden>·</span>}
          {part.node}
        </span>
      ))}
    </p>
  );
}

async function LivePill({ userTagOrId }: { userTagOrId: string }) {
  const [live, t] = await Promise.all([
    readProfileLive(userTagOrId),
    getTranslations("Users.profile"),
  ]);

  return live ? <LiveBadge label={t("live.badge")} /> : null;
}

async function ProfileHeroActions({ userTagOrId }: { userTagOrId: string }) {
  const [subject, viewer, { sellList }] = await Promise.all([
    requireProfile(userTagOrId),
    readProfileViewer(userTagOrId),
    readProfileLists(userTagOrId),
  ]);

  return (
    <ProfileActions
      userId={subject.user.id}
      isAuthenticated={viewer.isAuthenticated}
      isOwner={viewer.isOwner}
      isFollowing={viewer.isFollowing}
      isFriend={viewer.isFriend}
      hasPendingFriendRequest={viewer.hasPendingFriendRequest}
      canTrade={Boolean(sellList && sellList.itemsCount > 0)}
    />
  );
}

/** L'appel à poser une bannière, sur son propre profil et quand il n'y en a pas. */
async function AddBannerCallToAction({
  userTagOrId,
  hasBanner,
}: {
  userTagOrId: string;
  hasBanner: boolean;
}) {
  const [viewer, t] = await Promise.all([
    readProfileViewer(userTagOrId),
    getTranslations("Users.profile"),
  ]);

  if (hasBanner || !viewer.isOwner) {
    return null;
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <Button variant="outline" size="sm" asChild className="border-dashed bg-background/70">
        <Link href="/account?tab=showcase">
          <ImagePlus className="mr-2 h-4 w-4" aria-hidden />
          {t("hero.addBanner")}
        </Link>
      </Button>
    </div>
  );
}
