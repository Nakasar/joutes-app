import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getEventsByLairId } from "@/lib/db/events.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { isLairPro } from "@/lib/lairs/pro.ts";
import { readViewer, requireVisibleLair } from "@/app/[locale]/(app)/lairs/[lairId]/lair-data.ts";
import { isPosterPeriod, readPosterOptions } from "@/lib/posters/styles.ts";
import { POSTER_ZONE, posterRange, readPosterStart } from "@/lib/posters/period.ts";
import { locales, type Locale } from "@/i18n/config.ts";
import Poster, { posterDocumentTitle } from "@/components/posters/Poster.tsx";
import type { Game } from "@/lib/types/Game";

import PrintOnLoad from "./PrintOnLoad.tsx";

type PosterParams = Promise<{ locale: string; lairId: string }>;
type PosterSearchParams = Promise<{
  period?: string;
  start?: string;
  style?: string;
  attendance?: string;
  logos?: string;
  print?: string;
  brandLogo?: string;
  brandTitle?: string;
  brandText?: string;
  ctaTitle?: string;
  ctaText?: string;
  ctaUrl?: string;
}>;

/**
 * Le titre du document — c'est le nom de fichier que propose le navigateur à
 * l'enregistrement en PDF. `requireVisibleLair` est mémorisé par requête :
 * la page ne relit pas le lieu.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: PosterParams;
  searchParams: PosterSearchParams;
}): Promise<Metadata> {
  const [{ locale, lairId }, search] = await Promise.all([params, searchParams]);

  // Même piège Mongo que dans la page : la lecture du lieu touche à l'horloge.
  await connection();

  const lair = await requireVisibleLair(lairId);
  const period = isPosterPeriod(search.period) ? search.period : "week";
  const range = posterRange(period, readPosterStart(search.start, POSTER_ZONE));

  return { title: posterDocumentTitle(lair.name, range, locale) };
}

/**
 * L'affiche d'un lieu, page nue au format A4.
 *
 * `/lairs/:lairId/affiche?period=week|month&start=AAAA-MM-JJ` ; les autres
 * paramètres — `style`, `attendance`, `logos`, puis la signature et l'appel à
 * l'action — passent par-dessus les réglages enregistrés, pour l'aperçu de
 * l'écran de gestion. `print=1` ouvre la boîte d'impression au chargement :
 * c'est le chemin « enregistrer en PDF ».
 *
 * Visible par quiconque voit le lieu : c'est un document à partager, pas un
 * écran de gestion. Le style Pro, lui, ne dépend que du lieu.
 */
export default function LairPosterPage({
  params,
  searchParams,
}: {
  params: PosterParams;
  searchParams: PosterSearchParams;
}) {
  return (
    <Suspense fallback={null}>
      <LairPoster params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function LairPoster({ params, searchParams }: { params: PosterParams; searchParams: PosterSearchParams }) {
  const [{ locale, lairId }, search] = await Promise.all([params, searchParams]);

  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  setRequestLocale(locale);
  await connection();

  const lair = await requireVisibleLair(lairId);
  const [{ session, canManageLair }, t, isPro] = await Promise.all([
    readViewer(lairId),
    getTranslations("Lairs.poster"),
    isLairPro(lairId),
  ]);

  const period = isPosterPeriod(search.period) ? search.period : "week";
  const range = posterRange(period, readPosterStart(search.start, POSTER_ZONE));

  // Le style et les deux interrupteurs ne font que rebattre ce que l'affiche
  // dit déjà ; la signature et le QR code, eux, y écrivent un texte libre et
  // une adresse à scanner. Ceux-là ne sont lus que pour l'équipe du lieu —
  // sans quoi n'importe quelle adresse `joutes.app` deviendrait une affiche à
  // dire et à faire scanner ce qu'on veut.
  const footer = canManageLair
    ? {
        branding: { logo: search.brandLogo, title: search.brandTitle, text: search.brandText },
        cta: { title: search.ctaTitle, text: search.ctaText, url: search.ctaUrl },
      }
    : {};

  const options = readPosterOptions(lair, isPro, {
    style: search.style,
    showAttendance: search.attendance,
    gameLogos: search.logos,
    ...footer,
  });

  const [events, games] = await Promise.all([
    getEventsByLairId(lairId, { gameId: "all", userId: session?.user?.id }),
    Promise.all(lair.games.map((gameId) => readGameBySlugOrId(gameId))),
  ]);

  return (
    <>
      {/* Même mécanique que le layout principal : `lang` est un attribut de la
          coquille, qui ne connaît pas la langue ; il se pose depuis la
          frontière, une fois la langue lue. */}
      <script dangerouslySetInnerHTML={{ __html: `document.documentElement.lang=${JSON.stringify(locale)}` }} />
      <Poster
        lair={lair}
        events={events}
        games={games.filter((game): game is Game => game !== null)}
        range={range}
        options={options}
        locale={locale}
        t={(key, values) => t(key, values)}
      />
      {search.print === "1" && <PrintOnLoad />}
    </>
  );
}
