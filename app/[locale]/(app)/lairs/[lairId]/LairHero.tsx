import { Suspense } from "react";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Gamepad2, MapPin, Settings } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import ReportButton from "@/components/ReportButton.tsx";
import { readOpeningState } from "@/lib/lairs/opening-hours.ts";

import FollowLairButton from "./FollowLairButton.tsx";
import { readViewer, requireVisibleLair } from "./lair-data.ts";

/**
 * La bannière du lieu : son image, son logo, son nom, et de quoi agir.
 *
 * Le dégradé remonte du bas — opaque sous le texte, presque transparent en
 * haut — pour que le titre tienne sur n'importe quelle bannière sans voiler
 * l'image entière.
 */
export default async function LairHero({ lairId }: { lairId: string }) {
  const [lair, t, locale] = await Promise.all([
    requireVisibleLair(lairId),
    getTranslations("Lairs"),
    getLocale(),
  ]);

  const logo = lair.options?.theme?.logo;
  const category = lair.options?.about?.category;
  const opening = readOpeningState(lair.options?.openingHours, locale);

  const openingLine =
    opening.isOpen === true && opening.closesAt
      ? t("portal.openUntil", { time: opening.closesAt })
      : opening.isOpen === false
        ? t("portal.closedNow")
        : null;

  return (
    <div className="relative h-72 w-full bg-gradient-to-br from-primary/80 to-purple-600/80 md:h-[300px]">
      {lair.banner ? (
        <img
          src={lair.banner}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Gamepad2 className="h-24 w-24 text-white" />
        </div>
      )}

      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(8,6,4,.92)_12%,rgba(8,6,4,.35)_60%,rgba(8,6,4,.15))]" />

      <div className="absolute inset-x-0 bottom-0">
        <div className="container mx-auto flex max-w-7xl items-end gap-5 px-4 pb-6 lg:px-10">
          {logo && (
            <div className="relative hidden size-24 shrink-0 overflow-hidden rounded-[14px] border border-[var(--lair-accent-45)] bg-black/40 sm:block">
              <Image src={logo} alt="" fill className="object-cover" sizes="96px" />
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-[-0.02em] text-white sm:text-4xl md:text-[46px]">
                {lair.name}
              </h1>
              {category && (
                <span className="rounded-full border border-[var(--lair-accent-45)] px-2.5 py-1 text-xs font-medium text-[var(--lair-accent-text)]">
                  {category}
                </span>
              )}
            </div>

            {(lair.address || openingLine) && (
              <p className="flex max-w-2xl flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/80">
                {lair.address && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    {lair.address}
                  </span>
                )}
                {lair.address && openingLine && <span aria-hidden>·</span>}
                {openingLine && <span>{openingLine}</span>}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
              <Button variant="secondary" asChild size="sm">
                <Link href="/lairs">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t("detail.backToList")}
                </Link>
              </Button>
              {/* Suivre et Gérer demandent la session, et le compte derrière elle.
                  Leur frontière est ici plutôt qu'autour de la bannière : le nom
                  du lieu n'a aucune raison d'attendre l'identité du visiteur. */}
              <Suspense
                fallback={<div className="h-8 w-32 animate-pulse rounded-md bg-white/20" aria-hidden />}
              >
                <LairHeroActions lairId={lairId} />
              </Suspense>
              <ReportButton contentType="lair" contentId={lairId} variant="outline" size="sm" withLabel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function LairHeroActions({ lairId }: { lairId: string }) {
  const [{ session, isFollowing, canManageLair }, t] = await Promise.all([
    readViewer(lairId),
    getTranslations("Lairs"),
  ]);

  return (
    <>
      {session?.user && (
        <FollowLairButton lairId={lairId} isFollowing={isFollowing} isAuthenticated={!!session?.user} />
      )}
      {canManageLair && (
        <Button variant="default" asChild size="sm">
          <Link href={`/lairs/${lairId}/manage`}>
            <Settings className="mr-2 h-4 w-4" />
            {t("detail.manage")}
          </Link>
        </Button>
      )}
    </>
  );
}
