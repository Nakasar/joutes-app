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
}>;

/**
 * L'affiche d'un lieu, page nue au format A4.
 *
 * `/lairs/:lairId/affiche?period=week|month&start=AAAA-MM-JJ` ; les trois
 * autres paramètres — `style`, `attendance`, `logos` — passent par-dessus les
 * réglages enregistrés, pour l'aperçu de l'écran de gestion. `print=1` ouvre
 * la boîte d'impression au chargement : c'est le chemin « enregistrer en PDF ».
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
  const [{ session }, t, isPro] = await Promise.all([
    readViewer(lairId),
    getTranslations("Lairs.poster"),
    isLairPro(lairId),
  ]);

  const period = isPosterPeriod(search.period) ? search.period : "week";
  const range = posterRange(period, readPosterStart(search.start, POSTER_ZONE));
  const options = readPosterOptions(lair, isPro, {
    style: search.style,
    showAttendance: search.attendance,
    gameLogos: search.logos,
  });

  const [events, games] = await Promise.all([
    getEventsByLairId(lairId, { gameId: "all", userId: session?.user?.id }),
    Promise.all(lair.games.map((gameId) => readGameBySlugOrId(gameId))),
  ]);

  return (
    <>
      <title>{posterDocumentTitle(lair.name, range, locale)}</title>
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
