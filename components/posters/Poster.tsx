import QRCode from "qrcode";

import type { Event } from "@/lib/types/Event";
import type { Game } from "@/lib/types/Game";
import { externalUrl } from "@/lib/lairs/urls";
import { eventsInRange, groupByDay, groupByWeek, POSTER_ZONE, type PosterRange } from "@/lib/posters/period";
import { posterDayView, posterEvent, posterLabels, posterWeekView } from "@/lib/posters/format";
import type { PosterVenue } from "@/lib/posters/selection";
import type { PosterOptions } from "@/lib/posters/styles";
import { POSTER_VIEWS, type PosterStrings } from "./PosterStyles.tsx";

/** L'emblème Joutes, tant qu'un lieu Pro n'a pas posé le sien. */
const BRAND_ICON = "/logo/android-chrome-192x192.png";

/** L'origine publique du site, pour l'adresse que le QR code encode. */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://joutes.app").replace(/\/$/, "");
}

/**
 * Ce dont l'affiche parle.
 *
 * Un lieu qui publie la sienne, ou la sélection qu'un joueur compose : les
 * deux se réduisent à un bloc d'identité, une adresse à scanner, et le fait
 * que plusieurs lieux s'y mêlent ou non. L'affiche ne connaît que cela — elle
 * ne sait pas lire un lieu, et n'a donc aucune raison d'en recevoir un.
 */
export type PosterSubject = {
  /** Le nom et la ligne d'adresse, en tête d'affiche. */
  venue: PosterVenue;
  /** Ce que le QR code encode, sauf adresse choisie par un lieu Pro. */
  url: string;
  /** Vrai quand l'affiche réunit plusieurs lieux : chaque ligne dit le sien. */
  showVenues: boolean;
};

export type PosterProps = {
  subject: PosterSubject;
  events: Event[];
  games: Game[];
  range: PosterRange;
  options: PosterOptions;
  locale: string;
  /** `Lairs.poster.*` */
  t: (key: string, values?: Record<string, string | number>) => string;
};

/**
 * L'affiche : les événements d'une période, dans le style choisi.
 *
 * Le sujet peut être un lieu qui publie son programme ou la sélection qu'un
 * joueur compose ; l'affiche ne fait pas la différence, et c'est voulu : les
 * deux chemins rendent le même document, aux mêmes sept styles, avec les mêmes
 * règles de repli.
 *
 * Tout ce qui se calcule se calcule ici, une fois — la période, les groupes,
 * les libellés, le QR code — et le style ne fait que dessiner. C'est ce qui
 * garantit que sept styles disent la même chose de la même semaine.
 */
export default async function Poster({ subject, events, games, range, options, locale, t }: PosterProps) {
  const gamesByName = Object.fromEntries(games.map((game) => [game.name, game]));
  const strings = { free: t("free"), seats: (registered: number, capacity: number) => t("seats", { registered, capacity }) };
  const eventOptions = { logos: options.gameLogos, venues: subject.showVenues };

  const inRange = eventsInRange(events, range, POSTER_ZONE);
  const toView = (event: Event) => posterEvent(event, locale, POSTER_ZONE, gamesByName, strings, eventOptions);

  const days = groupByDay(inRange, range, POSTER_ZONE).map((day) => posterDayView(day, locale, day.events.map(toView)));
  const weeks = groupByWeek(inRange, range, POSTER_ZONE).map((week) => posterWeekView(week, locale, week.events.map(toView)));
  const labels = posterLabels(range, locale);

  const styleStrings: PosterStrings = {
    s: (key, values) => t(`styles.${options.style}.${key}`, values),
    t,
  };

  // Ce que le QR code encode : la page du lieu, ou l'adresse qu'un lieu Pro a
  // mise à la place — sa billetterie, son site. Elle est repassée par
  // `externalUrl` avant d'être encodée : un QR code se scanne sans se lire, et
  // ce qui en sort ouvre un navigateur.
  const target = externalUrl(options.cta.url) ?? subject.url;
  const qr = await QRCode.toString(target, { type: "svg", margin: 0 });
  const shortUrl = target.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // La signature du pied de page et l'appel à l'action : ceux du lieu, champ
  // par champ, ceux de Joutes et du style pour tout le reste.
  const brand = {
    logo: externalUrl(options.branding.logo) ?? BRAND_ICON,
    name: options.branding.title ?? "Joutes",
    line: options.branding.text ?? styleStrings.s("brandLine"),
  };
  const cta = {
    title: options.cta.title ?? styleStrings.s("cta"),
    // Le cyberpunk n'écrit pas de phrase sous son appel à l'action, mais
    // l'adresse elle-même : il n'a pas de `ctaSub` à traduire.
    text: options.cta.text ?? (options.style === "cyberpunk" ? shortUrl : styleStrings.s("ctaSub")),
  };

  const View = POSTER_VIEWS[options.style];
  const modes = `${options.gameLogos ? "jeux-logos" : "jeux-noms"}${options.showAttendance ? "" : " sans-freq"}`;

  return (
    <div className={`poster-modes ${modes}`}>
      <View
        style={options.style}
        period={range.period}
        venue={subject.venue}
        labels={labels}
        count={t("count", { count: inRange.length })}
        days={days}
        weeks={weeks}
        qr={qr}
        brand={brand}
        cta={cta}
        strings={styleStrings}
        monthName={range.start.setLocale(locale).toFormat("MMMM").replace(/^./, (c) => c.toLocaleUpperCase())}
      />
    </div>
  );
}

/** Le nom du fichier proposé par le navigateur à l'enregistrement en PDF. */
export function posterDocumentTitle(subject: string, range: PosterRange, locale: string): string {
  const start = range.start.setLocale(locale);
  const suffix = range.period === "week" ? start.toFormat("yyyy-'W'WW") : start.toFormat("yyyy-MM");

  return `${subject} – ${suffix}`;
}
