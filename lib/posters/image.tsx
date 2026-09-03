import { ImageResponse } from "next/og";
import QRCode from "qrcode";

import type { Event } from "@/lib/types/Event";
import type { Game } from "@/lib/types/Game";
import { externalUrl } from "@/lib/lairs/urls";
import { eventsInRange, groupByDay, groupByWeek, POSTER_ZONE, type PosterRange } from "@/lib/posters/period";
import {
  posterDayView,
  posterEvent,
  posterLabels,
  posterWeekView,
  type PosterDayView,
  type PosterEvent,
  type PosterWeekView,
} from "@/lib/posters/format";
import { planPosterBody, posterBodyHeight, type PosterGroup } from "@/lib/posters/layout";
import type { PosterStyleKey, PosterOptions } from "@/lib/posters/styles";
import type { PosterSubject } from "@/components/posters/Poster.tsx";

/**
 * L'affiche en image — une A4 qu'on poste au lieu de l'imprimer.
 *
 * L'affiche du site est une page HTML : sept styles, leurs polices et leurs
 * décors, que le navigateur imprime en PDF. Rien de tout cela ne traverse un
 * serveur sans navigateur, et le bot Discord n'en a pas : il lui faut des
 * pixels, tout de suite, dans la réponse à une commande.
 *
 * Ce module rend donc la **même affiche, dessinée autrement** : les mêmes
 * données, la même fenêtre, les mêmes libellés — tout vient des mêmes
 * fonctions que `components/posters/Poster.tsx` appelle —, mais posées avec ce
 * que `next/og` (satori) sait dessiner : des boîtes flex, des couleurs, une
 * police. Le style choisi s'y lit à sa palette et non à son décor : pas de
 * liège, pas de parchemin, pas de néons, et une seule police pour les sept.
 *
 * Ce n'est pas une régression déguisée : la page HTML reste le document à
 * imprimer, et c'est elle que le bouton « Ouvrir l'affiche » va chercher.
 * L'image, elle, existe pour être vue dans un fil de discussion.
 */

/** Le format de l'affiche : 210 × 297 mm à 96 dpi, comme la page HTML. */
export const POSTER_IMAGE_SIZE = { width: 794, height: 1123 } as const;

/**
 * La palette d'un style, reprise de `components/posters/poster.css`.
 *
 * Sept habillages qui n'ont ici ni police ni texture : ce qui les distingue
 * est ce qui survit à une image plate — le fond, l'encre, l'accent. Les
 * valeurs sont celles de la feuille de style, pour qu'une affiche postée sur
 * Discord se reconnaisse à côté de la même affiche imprimée.
 */
type PosterImageTheme = {
  background: string;
  /** Le fond d'une carte de jour. */
  panel: string;
  panelBorder: string;
  ink: string;
  muted: string;
  /** Les filets et les titres de période. */
  accent: string;
  /** Le nom d'un jour, au-dessus de ses événements. */
  accentText: string;
  /** Vrai : les libellés courts s'écrivent en capitales, comme dans le CSS. */
  uppercase: boolean;
};

export const POSTER_IMAGE_THEMES: Record<PosterStyleKey, PosterImageTheme> = {
  joutes: {
    background: "#0a0a0a",
    panel: "#151515",
    panelBorder: "#2a2a2a",
    ink: "#fafafa",
    muted: "#a3a3a3",
    accent: "#9333ea",
    accentText: "#c084fc",
    uppercase: true,
  },
  board: {
    background: "#a97a4e",
    panel: "#fff59a",
    panelBorder: "#d8c86a",
    ink: "#2b2118",
    muted: "#5b4a38",
    accent: "#1f3a8a",
    accentText: "#b3261e",
    uppercase: false,
  },
  tournament: {
    background: "#eadfc0",
    panel: "#f5ecd6",
    panelBorder: "#c2ab7c",
    ink: "#2b1d12",
    muted: "#6b5033",
    accent: "#8b1e2d",
    accentText: "#6b1420",
    uppercase: true,
  },
  cyberpunk: {
    background: "#05070f",
    panel: "#0b1522",
    panelBorder: "#0e4a5c",
    ink: "#e6f7ff",
    muted: "#7fa8b8",
    accent: "#ff2bd6",
    accentText: "#00e5ff",
    uppercase: true,
  },
  tavern: {
    background: "#3a2414",
    panel: "#4a3018",
    panelBorder: "#8a6a3a",
    ink: "#f1e3c3",
    muted: "#cbb489",
    accent: "#f2cf7a",
    accentText: "#f2cf7a",
    uppercase: false,
  },
  scifi: {
    background: "#e3edf7",
    panel: "#ffffff",
    panelBorder: "#b9cbe0",
    ink: "#0f2f52",
    muted: "#4a637d",
    accent: "#0ea5e9",
    accentText: "#0f2f52",
    uppercase: true,
  },
  grimoire: {
    background: "#e2d2ab",
    panel: "#f0e4c8",
    panelBorder: "#c8a45a",
    ink: "#2b1a10",
    muted: "#4a3728",
    accent: "#8a2a1f",
    accentText: "#8a2a1f",
    uppercase: false,
  },
};

/**
 * La clé du titre que chaque style écrit en tête.
 *
 * Les sept styles ne nomment pas leur en-tête de la même façon : le style
 * Joutes l'appelle son « kicker », les six autres leur « titre ». Ce sont des
 * clés de messages, pas une donnée du domaine, et c'est pourquoi la table est
 * ici plutôt que dans `lib/posters/styles.ts`.
 */
function kickerKey(style: PosterStyleKey, period: PosterRange["period"]): string {
  const suffix = period === "week" ? "Week" : "Month";

  return `${style === "joutes" ? "kicker" : "title"}${suffix}`;
}

/**
 * Ce que ce titre peut contenir : « Semaine {week} », « Joutes de {month} »…
 *
 * Les quatre valeurs sont passées à chaque fois, quel que soit le style : un
 * message qui n'en veut pas les ignore, et l'alternative — une table de plus
 * disant qui prend quoi — se désaccorderait au premier texte réécrit. Seule la
 * casse du mois se décide ici, comme dans `PosterStyles.tsx` : le grimoire
 * écrit « Grimoire de septembre », les autres commencent par une capitale.
 */
function kickerValues(style: PosterStyleKey, monthName: string, labels: { big: string; year: string; isoWeek: number }) {
  return {
    month: style === "grimoire" ? monthName.toLocaleLowerCase() : monthName,
    year: labels.year,
    range: labels.big,
    week: labels.isoWeek,
  };
}

export type PosterImageProps = {
  subject: PosterSubject;
  events: Event[];
  games: Game[];
  range: PosterRange;
  options: PosterOptions;
  locale: string;
  /** `Lairs.poster.*`, comme pour la page HTML. */
  t: (key: string, values?: Record<string, string | number>) => string;
};

/**
 * L'affiche, en PNG.
 *
 * Rend les octets plutôt qu'une `Response` : l'appelant les joint à un message
 * Discord, il n'a pas de requête HTTP à servir. Une image publiée à une adresse
 * publique aurait posé la question à laquelle personne ne sait répondre hors
 * session — « qui a le droit de voir ces lieux ? » —, alors que la pièce
 * jointe ne va qu'au salon où la commande a été tapée.
 */
export async function renderPosterImage(props: PosterImageProps): Promise<Uint8Array> {
  const response = new ImageResponse(await posterImageElement(props), POSTER_IMAGE_SIZE);

  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Le dessin lui-même.
 *
 * Tout ce qui se calcule se calcule ici, une fois, et par les mêmes fonctions
 * que l'affiche HTML : c'est ce qui garantit que l'image et le document
 * imprimé disent la même chose de la même semaine.
 */
async function posterImageElement({ subject, events, games, range, options, locale, t }: PosterImageProps) {
  const theme = POSTER_IMAGE_THEMES[options.style];
  const gamesByName = Object.fromEntries(games.map((game) => [game.name, game]));
  const strings = {
    free: t("free"),
    seats: (registered: number, capacity: number) => t("seats", { registered, capacity }),
  };
  const eventOptions = { logos: false, venues: subject.showVenues };

  const inRange = eventsInRange(events, range, POSTER_ZONE);
  const toView = (event: Event) => posterEvent(event, locale, POSTER_ZONE, gamesByName, strings, eventOptions);

  const days = groupByDay(inRange, range, POSTER_ZONE)
    .map((day) => posterDayView(day, locale, day.events.map(toView)))
    .filter((day) => day.events.length > 0);
  const weeks = groupByWeek(inRange, range, POSTER_ZONE).map((week) =>
    posterWeekView(week, locale, week.events.map(toView)),
  );
  const labels = posterLabels(range, locale);

  // Ce que la page peut porter : l'échelle, puis, s'il le faut, ce qu'elle
  // renonce à écrire.
  const groups: PosterGroup[] =
    range.period === "week"
      ? days.map((day) => ({ titled: false, events: day.events }))
      : weeks.map((week) => ({ titled: true, events: week.events }));
  const plan = planPosterBody(groups, posterBodyHeight(subject.venue));
  const px = (size: number) => Math.round(size * plan.scale);

  // Le QR code, encodé sur place : l'affiche ne va chercher aucune image sur
  // le réseau. Satori échouerait tout entier sur une image qui ne répond pas,
  // et une affiche qui ne se rend pas vaut moins qu'une affiche sans logo.
  const target = externalUrl(options.cta.url) ?? subject.url;
  const qr = await QRCode.toString(target, { type: "svg", margin: 0, width: 132 });
  const qrSource = `data:image/svg+xml;base64,${Buffer.from(qr).toString("base64")}`;
  const shortUrl = target.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const style = (key: string, values?: Record<string, string | number>) =>
    t(`styles.${options.style}.${key}`, values);
  const monthName = range.start.setLocale(locale).toFormat("MMMM").replace(/^./, (c) => c.toLocaleUpperCase());
  const brand = {
    name: options.branding.title ?? "Joutes",
    line: options.branding.text ?? style("brandLine"),
  };
  const cta = {
    title: options.cta.title ?? style("cta"),
    // Le cyberpunk n'écrit pas de phrase sous son appel à l'action mais
    // l'adresse elle-même : il n'a pas de `ctaSub` à traduire.
    text: options.cta.text ?? (options.style === "cyberpunk" ? shortUrl : style("ctaSub")),
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "44px 48px 38px",
        backgroundColor: theme.background,
        color: theme.ink,
        fontSize: 16,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            fontSize: 13,
            letterSpacing: 2,
            textTransform: theme.uppercase ? "uppercase" : "none",
            color: theme.accentText,
          }}
        >
          {style(kickerKey(options.style, range.period), kickerValues(options.style, monthName, labels))}
        </div>
        {/* Le nom du sujet ne se coupe jamais : c'est ce qu'on vient lire. */}
        <div style={{ display: "flex", marginTop: 6, fontSize: 44, fontWeight: 700, lineHeight: 1.05 }}>
          {subject.venue.name}
        </div>
        {subject.venue.address ? (
          <div style={{ display: "flex", marginTop: 8, fontSize: 17, color: theme.muted }}>
            {subject.venue.address}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            marginTop: 18,
            alignItems: "flex-end",
            justifyContent: "space-between",
            borderBottom: `3px solid ${theme.accent}`,
            paddingBottom: 12,
          }}
        >
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: theme.accent }}>{labels.big}</div>
          <div style={{ display: "flex", fontSize: 15, color: theme.muted }}>
            {labels.year} · {t("count", { count: inRange.length })}
          </div>
        </div>
      </div>

      {/* Le corps prend la place qui reste et la rend : `minHeight` à zéro est
          ce qui empêche une semaine trop chargée de pousser le pied de page
          hors de la feuille — un débordement de flex ne se coupe pas tout
          seul. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          flexShrink: 1,
          minHeight: 0,
          marginTop: 18,
          overflow: "hidden",
        }}
      >
        {inRange.length === 0 ? (
          <div style={{ display: "flex", marginTop: 40, fontSize: 22, color: theme.muted }}>{t("empty")}</div>
        ) : range.period === "week" ? (
          days
            .map((day, index) => ({ ...day, events: plan.kept[index] }))
            .filter((day) => day.events.length > 0)
            .map((day) => <DayCard key={day.padded} day={day} theme={theme} px={px} full={style("full")} />)
        ) : (
          weeks
            .map((week, index) => ({ ...week, events: plan.kept[index] }))
            .filter((week) => week.events.length > 0)
            .map((week) => (
              <WeekCard key={week.isoWeek} week={week} theme={theme} px={px} full={style("full")} />
            ))
        )}
        {/* Ce qui ne tient pas se compte plutôt que de disparaître : la page
            HTML, elle, laisse la A4 couper en silence. */}
        {plan.hidden > 0 ? (
          <div style={{ display: "flex", marginTop: 8, fontSize: 14, color: theme.muted }}>
            + {t("count", { count: plan.hidden })}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          flexShrink: 0,
          marginTop: 18,
          paddingTop: 16,
          borderTop: `2px solid ${theme.accent}`,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 380 }}>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>{brand.name}</div>
          <div style={{ display: "flex", marginTop: 4, fontSize: 14, color: theme.muted }}>{brand.line}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: 300, marginRight: 14 }}>
            <div style={{ display: "flex", fontSize: 17, fontWeight: 700, color: theme.accentText, textAlign: "right" }}>
              {cta.title}
            </div>
            <div style={{ display: "flex", marginTop: 4, fontSize: 13, color: theme.muted, textAlign: "right" }}>
              {cta.text}
            </div>
          </div>
          {/* Le QR code garde son fond blanc quel que soit le style : il se
              scanne, il ne se décore pas. */}
          <div style={{ display: "flex", padding: 8, backgroundColor: "#ffffff", borderRadius: 6 }}>
            <img src={qrSource} width={104} height={104} alt="" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Un jour de la semaine, avec ses événements. */
function DayCard({
  day,
  theme,
  px,
  full,
}: {
  day: PosterDayView;
  theme: PosterImageTheme;
  px: (size: number) => number;
  /** La mention « complet » du style. */
  full: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        marginBottom: px(10),
        padding: `${px(12)}px ${px(16)}px`,
        backgroundColor: theme.panel,
        border: `1px solid ${theme.panelBorder}`,
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: px(96), flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            fontSize: px(13),
            letterSpacing: 1.5,
            textTransform: theme.uppercase ? "uppercase" : "none",
            color: theme.accentText,
          }}
        >
          {day.short}
        </div>
        <div style={{ display: "flex", fontSize: px(30), fontWeight: 700, lineHeight: 1 }}>{day.number}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        {day.events.map((event) => (
          <EventLine key={event.id} event={event} theme={theme} px={px} full={full} />
        ))}
      </div>
    </div>
  );
}

/** Une semaine du mois : l'affiche mensuelle liste, elle ne calendrise pas. */
function WeekCard({
  week,
  theme,
  px,
  full,
}: {
  week: PosterWeekView;
  theme: PosterImageTheme;
  px: (size: number) => number;
  full: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        marginBottom: px(10),
        padding: `${px(12)}px ${px(16)}px`,
        backgroundColor: theme.panel,
        border: `1px solid ${theme.panelBorder}`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: px(14),
          letterSpacing: 1.5,
          textTransform: theme.uppercase ? "uppercase" : "none",
          color: theme.accentText,
          marginBottom: px(6),
        }}
      >
        {week.label}
      </div>
      {week.events.map((event) => (
        <EventLine key={event.id} event={event} theme={theme} px={px} full={full} withDate />
      ))}
    </div>
  );
}

/**
 * Une ligne d'événement : l'heure, le nom, puis ce qui le qualifie.
 *
 * Le jeu s'y écrit toujours par son nom, jamais par son logo : une image
 * distante à chercher ferait dépendre l'affiche entière d'un serveur qui
 * répond, et satori abandonne tout le dessin quand une image manque.
 */
function EventLine({
  event,
  theme,
  px,
  full,
  withDate = false,
}: {
  event: PosterEvent;
  theme: PosterImageTheme;
  px: (size: number) => number;
  full: string;
  withDate?: boolean;
}) {
  const meta = [event.venue, event.price, event.seats].filter((part): part is string => Boolean(part));

  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: px(6) }}>
      <div style={{ display: "flex", alignItems: "baseline" }}>
        {withDate ? (
          <div style={{ display: "flex", width: px(62), flexShrink: 0, fontSize: px(14), color: theme.muted }}>
            {event.dateShort}
          </div>
        ) : null}
        <div style={{ display: "flex", width: px(102), flexShrink: 0, fontSize: px(14), color: theme.accentText }}>
          {event.time}
        </div>
        <div style={{ display: "flex", fontSize: px(18), fontWeight: 700, flexGrow: 1 }}>{event.name}</div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginTop: px(2),
          marginLeft: withDate ? px(62) : 0,
          paddingLeft: px(102),
          fontSize: px(13),
          color: theme.muted,
        }}
      >
        <div style={{ display: "flex", width: px(8), height: px(8), borderRadius: px(8), backgroundColor: event.game.color, marginRight: px(6) }} />
        <div style={{ display: "flex", color: theme.ink }}>{event.game.short}</div>
        {meta.length > 0 ? <div style={{ display: "flex", marginLeft: px(8) }}>· {meta.join(" · ")}</div> : null}
        {event.full ? (
          <div style={{ display: "flex", marginLeft: px(8), fontWeight: 700, color: theme.accent }}>{full}</div>
        ) : null}
      </div>
    </div>
  );
}
