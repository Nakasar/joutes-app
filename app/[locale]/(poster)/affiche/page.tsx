import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getEventsByLairIds } from "@/lib/db/events.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { visibleLairsAmong } from "@/lib/lairs/visible.ts";
import { hasEntitlement } from "@/lib/subscriptions/access.ts";
import { isPosterPeriod, readPosterOptions } from "@/lib/posters/styles.ts";
import { POSTER_ZONE, posterRange, readPosterStart } from "@/lib/posters/period.ts";
import { posterVenue, readGameKeys, readLairIds } from "@/lib/posters/selection.ts";
import { locales, type Locale } from "@/i18n/config.ts";
import Poster, { posterDocumentTitle, siteOrigin } from "@/components/posters/Poster.tsx";
import type { Game } from "@/lib/types/Game";

import PrintOnLoad from "@/components/posters/PrintOnLoad.tsx";

type PosterParams = Promise<{ locale: string }>;
type PosterSearchParams = Promise<{
  lairs?: string;
  games?: string;
  period?: string;
  start?: string;
  style?: string;
  attendance?: string;
  logos?: string;
  print?: string;
}>;

/** Les libellés de l'en-tête quand l'affiche réunit plusieurs lieux. */
function venueStrings(t: (key: string, values?: Record<string, string | number>) => string) {
  return {
    venues: (count: number) => t("venues", { count }),
    more: (count: number) => t("more", { count }),
  };
}

/**
 * Le titre du document — le nom de fichier proposé à l'enregistrement en PDF.
 *
 * `visibleLairsAmong` est mémorisé par requête : la page ne relit pas les lieux.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: PosterParams;
  searchParams: PosterSearchParams;
}): Promise<Metadata> {
  const [{ locale }, search] = await Promise.all([params, searchParams]);

  // Même piège Mongo que dans la page : la lecture des lieux touche à l'horloge.
  await connection();

  const [lairs, t] = await Promise.all([
    visibleLairsAmong(readLairIds(search.lairs)),
    getTranslations({ locale, namespace: "Lairs.poster" }),
  ]);

  if (lairs.length === 0) {
    return {};
  }

  const period = isPosterPeriod(search.period) ? search.period : "week";
  const range = posterRange(period, readPosterStart(search.start, POSTER_ZONE));
  const venue = posterVenue(lairs, venueStrings(t));

  return { title: posterDocumentTitle(venue.name, range, locale) };
}

/**
 * L'affiche qu'un joueur compose : les lieux et les jeux qu'il a choisis.
 *
 * `/affiche?lairs=id,id&games=clé,clé&period=week|month&start=AAAA-MM-JJ`, plus
 * `style`, `attendance` et `logos` comme sur l'affiche d'un lieu. Rien n'est
 * enregistré : **l'adresse est l'affiche**, ce qui la rend partageable telle
 * quelle et dispense d'un document de plus en base.
 *
 * Le pied de page n'est pas réglable ici. L'affiche d'un lieu Pro porte sa
 * signature parce que c'est son programme ; celle-ci réunit les lieux d'autrui
 * et ne signe donc au nom de personne : l'emblème Joutes, et un QR code vers
 * joutes.app. Rien à passer pour cela — les réglages absents suffisent.
 *
 * Les quatre styles réservés s'ouvrent au compte qui tient Joutes Expert ou
 * Joutes Pro. Le verrou se lit sur **le visiteur**, et non sur qui a composé
 * l'affiche : une adresse partagée montre donc le style par défaut à qui n'est
 * pas abonné, comme un style Pro retombe sur le style par défaut quand
 * l'abonnement d'un lieu s'arrête.
 */
export default function FreePosterPage({
  params,
  searchParams,
}: {
  params: PosterParams;
  searchParams: PosterSearchParams;
}) {
  return (
    <Suspense fallback={null}>
      <FreePoster params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function FreePoster({ params, searchParams }: { params: PosterParams; searchParams: PosterSearchParams }) {
  const [{ locale }, search] = await Promise.all([params, searchParams]);

  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  setRequestLocale(locale);
  await connection();

  const lairs = await visibleLairsAmong(readLairIds(search.lairs));

  // Aucun lieu qu'on ait le droit de voir : il n'y a pas d'affiche à rendre.
  // Une sélection vide et une sélection entièrement privée se répondent de la
  // même façon, ce qui est exactement le but.
  if (lairs.length === 0) {
    notFound();
  }

  const [t, unlocked] = await Promise.all([
    getTranslations("Lairs.poster"),
    hasEntitlement("sub:poster-styles"),
  ]);

  const period = isPosterPeriod(search.period) ? search.period : "week";
  const range = posterRange(period, readPosterStart(search.start, POSTER_ZONE));

  // Ni signature ni appel à l'action : aucun réglage enregistré, aucune
  // dérogation par l'URL. Le pied de page reste celui de Joutes.
  const options = readPosterOptions(undefined, unlocked, {
    style: search.style,
    showAttendance: search.attendance,
    gameLogos: search.logos,
  });

  // Les jeux des lieux retenus : ce sont eux qui portent les couleurs et les
  // logos, et c'est parmi eux que se choisit le filtre.
  const gameIds = [...new Set(lairs.flatMap((lair) => lair.games))];
  const games = (await Promise.all(gameIds.map((gameId) => readGameBySlugOrId(gameId)))).filter(
    (game): game is Game => game !== null,
  );

  // Le filtre par jeu se fait sur le **nom**, celui que porte l'événement :
  // c'est le seul lien entre un événement et un jeu en base, et il évite de
  // convertir en `ObjectId` une clé venue de l'URL.
  const asked = new Set(readGameKeys(search.games));
  const keptNames =
    asked.size > 0
      ? new Set(games.filter((game) => asked.has(game.id) || (game.slug && asked.has(game.slug))).map((game) => game.name))
      : null;

  // Une fenêtre élargie d'un jour de chaque côté : la comparaison se fait en
  // base sur la chaîne ISO, et deux événements écrits avec des décalages
  // différents s'y départagent mal. `eventsInRange` refait le cadrage sur
  // l'instant, proprement.
  const events = await getEventsByLairIds(
    lairs.map((lair) => lair.id),
    {
      afterDate: range.start.minus({ days: 1 }).toISO() ?? undefined,
      beforeDate: range.end.plus({ days: 1 }).endOf("day").toISO() ?? undefined,
    },
  );

  return (
    <>
      {/* Même mécanique que le layout principal : `lang` est un attribut de la
          coquille, qui ne connaît pas la langue ; il se pose depuis la
          frontière, une fois la langue lue. */}
      <script dangerouslySetInnerHTML={{ __html: `document.documentElement.lang=${JSON.stringify(locale)}` }} />
      <Poster
        subject={{
          venue: posterVenue(lairs, venueStrings(t)),
          url: siteOrigin(),
          // Plusieurs lieux : chaque ligne dit le sien, sans quoi l'affiche
          // annonce des soirées sans dire où elles ont lieu.
          showVenues: lairs.length > 1,
        }}
        events={keptNames ? events.filter((event) => keptNames.has(event.gameName)) : events}
        games={games}
        range={range}
        options={options}
        locale={locale}
        t={(key, values) => t(key, values)}
      />
      {search.print === "1" && <PrintOnLoad />}
    </>
  );
}
