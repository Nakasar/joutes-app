import QRCode from "qrcode";

import type { Event } from "@/lib/types/Event";
import type { Game } from "@/lib/types/Game";
import type { Lair } from "@/lib/types/Lair";
import { externalUrl } from "@/lib/lairs/urls";
import { eventsInRange, groupByDay, groupByWeek, type PosterRange } from "@/lib/posters/period";
import { posterDayView, posterEvent, posterLabels, posterWeekView } from "@/lib/posters/format";
import type { PosterOptions } from "@/lib/posters/styles";
import { POSTER_VIEWS, type PosterStrings } from "./PosterStyles.tsx";

/** Le fuseau des lieux : ils sont en France, leurs horaires aussi. */
export const POSTER_ZONE = "Europe/Paris";

/** L'origine publique du site, pour l'adresse que le QR code encode. */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://joutes.app").replace(/\/$/, "");
}

export type PosterProps = {
  lair: Pick<Lair, "id" | "name" | "address" | "options">;
  events: Event[];
  games: Game[];
  range: PosterRange;
  options: PosterOptions;
  locale: string;
  /** `Lairs.poster.*` */
  t: (key: string, values?: Record<string, string | number>) => string;
};

/**
 * L'affiche d'un lieu : ses événements de la période, dans le style choisi.
 *
 * Tout ce qui se calcule se calcule ici, une fois — la période, les groupes,
 * les libellés, le QR code — et le style ne fait que dessiner. C'est ce qui
 * garantit que sept styles disent la même chose de la même semaine.
 */
export default async function Poster({ lair, events, games, range, options, locale, t }: PosterProps) {
  const gamesByName = Object.fromEntries(games.map((game) => [game.name, game]));
  const strings = { free: t("free"), seats: (registered: number, capacity: number) => t("seats", { registered, capacity }) };
  const gameOptions = { logos: options.gameLogos };

  const inRange = eventsInRange(events, range, POSTER_ZONE);
  const toView = (event: Event) => posterEvent(event, locale, POSTER_ZONE, gamesByName, strings, gameOptions);

  const days = groupByDay(inRange, range, POSTER_ZONE).map((day) => posterDayView(day, locale, day.events.map(toView)));
  const weeks = groupByWeek(inRange, range, POSTER_ZONE).map((week) => posterWeekView(week, locale, week.events.map(toView)));
  const labels = posterLabels(range, locale);

  const origin = siteOrigin();
  const qr = await QRCode.toString(`${origin}/lairs/${lair.id}`, { type: "svg", margin: 0 });

  const styleStrings: PosterStrings = {
    s: (key, values) => t(`styles.${options.style}.${key}`, values),
    t,
  };

  const View = POSTER_VIEWS[options.style];
  const modes = `${options.gameLogos ? "jeux-logos" : "jeux-noms"}${options.showAttendance ? "" : " sans-freq"}`;
  const logo = externalUrl(lair.options?.theme?.logo) ?? undefined;

  return (
    <div className={`poster-modes ${modes}`}>
      <View
        style={options.style}
        period={range.period}
        lair={{ id: lair.id, name: lair.name, address: lair.address || undefined, logo }}
        labels={labels}
        count={t("count", { count: inRange.length })}
        days={days}
        weeks={weeks}
        qr={qr}
        url={t("scanUrl", { lairId: lair.id })}
        brandIcon="/logo/android-chrome-192x192.png"
        strings={styleStrings}
        monthName={range.start.setLocale(locale).toFormat("MMMM").replace(/^./, (c) => c.toLocaleUpperCase())}
      />
    </div>
  );
}

/** Le nom du fichier proposé par le navigateur à l'enregistrement en PDF. */
export function posterDocumentTitle(lairName: string, range: PosterRange, locale: string): string {
  const start = range.start.setLocale(locale);
  const suffix = range.period === "week" ? start.toFormat("yyyy-'W'WW") : start.toFormat("yyyy-MM");

  return `${lairName} – ${suffix}`;
}
