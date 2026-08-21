import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Facebook,
  Globe,
  Instagram,
  Link2,
  Mail,
  MessageCircle,
  Phone,
  Twitch,
  Youtube,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { formatOpeningRanges, readOpeningState, weekOf } from "@/lib/lairs/opening-hours.ts";
import { externalUrl } from "@/lib/lairs/urls.ts";
import type { LairLink, Lair } from "@/lib/types/Lair";
import type { Game } from "@/lib/types/Game";

import LairMap from "./LairMap.tsx";

/** La carte de base de la colonne de droite — même fond, même bordure partout. */
export function SidebarCard({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-xl border bg-card p-[18px]", className)}>
      {(title || action) && (
        <div className="flex items-baseline justify-between gap-2">
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const LINK_ICONS: Record<LairLink["type"], LucideIcon> = {
  website: Globe,
  instagram: Instagram,
  facebook: Facebook,
  discord: MessageCircle,
  twitch: Twitch,
  youtube: Youtube,
  x: Link2,
  other: Link2,
};

/** Informations pratiques : état d'ouverture, adresse, contact, carte, actions. */
export async function LairPracticalInfoCard({ lair }: { lair: Lair }) {
  const [t, locale] = await Promise.all([getTranslations("Lairs.portal.info"), getLocale()]);

  const opening = readOpeningState(lair.options?.openingHours, locale);
  const phone = lair.options?.contact?.phone;
  const email = lair.options?.contact?.email;
  const website = externalUrl(lair.website);

  const directionsUrl = lair.location
    ? `https://www.google.com/maps/dir/?api=1&destination=${lair.location.coordinates[1]},${lair.location.coordinates[0]}`
    : lair.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lair.address)}`
      : null;

  if (!lair.address && !website && !lair.location && !phone && !email) {
    return null;
  }

  return (
    <SidebarCard
      title={t("title")}
      action={
        opening.isOpen === null ? null : (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs",
              opening.isOpen
                ? "bg-emerald-400/15 text-emerald-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            {opening.isOpen ? t("open") : t("closed")}
          </span>
        )
      }
    >
      <div className="flex flex-col gap-2.5 text-[13px] leading-[1.5] text-muted-foreground">
        {lair.address && <p className="text-foreground/80">{lair.address}</p>}
        {phone && (
          <a href={`tel:${phone.replace(/\s/g, "")}`} className="flex items-center gap-2 hover:text-foreground">
            <Phone className="size-3.5 shrink-0" aria-hidden />
            {phone}
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} className="flex items-center gap-2 break-all hover:text-foreground">
            <Mail className="size-3.5 shrink-0" aria-hidden />
            {email}
          </a>
        )}
        {website && (
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-[var(--lair-accent-text)] hover:underline"
          >
            {website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
          </a>
        )}
      </div>

      <LairMap location={lair.location} name={lair.name} />

      {(directionsUrl || phone) && (
        <div className="flex flex-wrap gap-2">
          {directionsUrl && (
            <Button
              asChild
              size="sm"
              className="flex-1 bg-[var(--lair-accent)] text-[var(--lair-accent-foreground)] hover:bg-[var(--lair-accent)]/90"
            >
              <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                {t("directions")}
              </a>
            </Button>
          )}
          {phone && (
            <Button asChild size="sm" variant="outline" className="flex-1">
              <a href={`tel:${phone.replace(/\s/g, "")}`}>{t("call")}</a>
            </Button>
          )}
        </div>
      )}
    </SidebarCard>
  );
}

/**
 * Les horaires de la semaine.
 *
 * Le jour courant est repris à l'accent et annoncé comme « Aujourd'hui » : sur
 * une liste de sept lignes identiques, c'est la seule qu'on vient réellement
 * lire.
 *
 * Un jour coupé empile ses plages à droite du nom du jour plutôt que de les
 * réunir sur une ligne : « 10h — 12h · 14h — 19h » tient mal dans une colonne
 * de 320 px, et sa coupure se perd au milieu de quatre heures alignées.
 */
export async function LairOpeningHoursCard({ lair }: { lair: Lair }) {
  const openingHours = lair.options?.openingHours;

  if (!openingHours || openingHours.length === 0) {
    return null;
  }

  const [t, locale] = await Promise.all([getTranslations("Lairs.portal.hours"), getLocale()]);
  const { todayDay } = readOpeningState(openingHours, locale);

  return (
    <SidebarCard title={t("title")}>
      <dl className="flex flex-col gap-[7px] text-[13px]">
        {weekOf(openingHours).map(({ day, ranges }) => {
          const isToday = todayDay === day;
          const formatted = formatOpeningRanges(ranges, locale);

          return (
            <div
              key={day}
              className={cn(
                "flex justify-between gap-3",
                isToday ? "text-[var(--lair-accent-text)]" : "text-foreground/80",
              )}
            >
              <dt>{isToday ? t("today") : dayName(day, locale)}</dt>
              <dd
                className={cn(
                  "flex flex-col items-end text-right",
                  formatted.length === 0 && !isToday && "text-muted-foreground",
                )}
              >
                {/* La clé est le rang, non le texte : deux plages d'un même
                    jour peuvent se formater à l'identique — des horaires
                    anciens en portent le doublon, que l'ancien schéma laissait
                    passer — et la clé collerait alors sur deux lignes. */}
                {formatted.length > 0
                  ? formatted.map((range, index) => <span key={index}>{range}</span>)
                  : t("closed")}
              </dd>
            </div>
          );
        })}
      </dl>
    </SidebarCard>
  );
}

function dayName(day: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long" })
    // 2024-01-01 est un lundi : sept jours à partir de là couvrent la semaine
    // ISO dans l'ordre attendu, sans dépendre du premier jour de la locale.
    .format(new Date(Date.UTC(2024, 0, day)))
    .replace(/^./, (letter) => letter.toUpperCase());
}

/** Les réseaux du lieu, et le nombre de joueurs qui le suivent. */
export async function LairFollowCard({
  lair,
  followersCount,
}: {
  lair: Lair;
  followersCount: number;
}) {
  // Les liens dont le protocole n'est pas http(s) sont retirés plutôt que
  // rendus inertes : une ligne « Instagram » qui ne mène nulle part vaut moins
  // que pas de ligne du tout.
  const links = (lair.options?.links ?? []).flatMap((link) => {
    const url = externalUrl(link.url);
    return url ? [{ ...link, url }] : [];
  });

  if (links.length === 0 && followersCount === 0) {
    return null;
  }

  const t = await getTranslations("Lairs.portal.follow");

  return (
    <SidebarCard title={t("title")}>
      {links.length > 0 && (
        <ul className="flex flex-col gap-2.5 text-[13px]">
          {links.map((link) => {
            const Icon = LINK_ICONS[link.type] ?? Link2;

            return (
              <li key={`${link.type}-${link.url}`}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-foreground/80 hover:text-foreground"
                >
                  <Icon className="size-[15px] shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">
                    {link.label ?? link.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {followersCount > 0 && (
        <p
          className={cn(
            "text-xs leading-[1.5] text-muted-foreground",
            links.length > 0 && "border-t pt-2.5",
          )}
        >
          {t("followers", { count: followersCount })}
        </p>
      )}
    </SidebarCard>
  );
}

/**
 * Les jeux joués ici, en vignettes.
 *
 * Le chiffre en bas à droite est le nombre d'événements à venir sur ce jeu :
 * c'est ce qui distingue un jeu qu'on trouve en rayon d'un jeu qu'on peut
 * venir jouer samedi. Il passe à l'accent au-delà de trois.
 */
export async function LairGamesCard({
  lairId,
  games,
  upcomingByGame,
  limit = 5,
}: {
  lairId: string;
  games: Game[];
  upcomingByGame: Record<string, number>;
  limit?: number;
}) {
  if (games.length === 0) {
    return null;
  }

  const t = await getTranslations("Lairs.portal.games");
  const shown = games.slice(0, limit);
  const remaining = games.length - shown.length;

  return (
    <SidebarCard
      title={t("title")}
      action={<span className="text-xs text-muted-foreground">{t("count", { count: games.length })}</span>}
    >
      <div className="grid grid-cols-2 gap-2">
        {shown.map((game) => (
          <GameTile key={game.id} game={game} upcoming={upcomingByGame[game.name] ?? 0} />
        ))}
        {/* Vers l'onglet du lieu, non vers le catalogue : « autres jeux »
            promet les autres jeux *d'ici*. */}
        {remaining > 0 && (
          <Link
            href={`/lairs/${lairId}?tab=games`}
            className="flex h-[74px] flex-col items-center justify-center gap-0.5 rounded-[9px] border border-dashed transition-colors hover:border-[var(--lair-accent-45)]"
          >
            <span className="text-sm font-semibold">+{remaining}</span>
            <span className="text-[11px] text-muted-foreground">{t("others")}</span>
          </Link>
        )}
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">{t("legend")}</p>
    </SidebarCard>
  );
}

function GameTile({ game, upcoming }: { game: Game; upcoming: number }) {
  const banner = game.banner ?? game.images?.banner ?? game.images?.horizontal;
  const icon = game.icon ?? game.images?.icon;

  return (
    <Link
      href={`/games/${game.slug ?? game.id}`}
      className={cn(
        "relative block h-[74px] overflow-hidden rounded-[9px] border transition-transform hover:scale-[1.02]",
        upcoming > 3 ? "border-[var(--lair-accent-28)]" : "border-border",
      )}
      style={game.color ? { backgroundColor: game.color } : undefined}
    >
      {banner && <Image src={banner} alt="" fill className="object-cover" sizes="140px" />}
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/90 to-black/15"
      />
      {icon && (
        <Image
          src={icon}
          alt=""
          width={22}
          height={22}
          className="absolute top-1.5 left-1.5 size-[22px] rounded-md bg-white/10 object-contain p-0.5"
        />
      )}
      <span className="absolute inset-x-2 bottom-[7px] flex items-center justify-between gap-1.5">
        <span className="truncate text-xs font-semibold text-white">{game.name}</span>
        {upcoming > 0 && (
          <span
            className={cn(
              "font-mono text-[10px]",
              upcoming > 3 ? "text-[var(--lair-accent-text)]" : "text-white/70",
            )}
          >
            {upcoming}
          </span>
        )}
      </span>
    </Link>
  );
}
