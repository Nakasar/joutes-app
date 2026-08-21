"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Clock, LocateFixed, MapPin, Play, Repeat, Search } from "lucide-react";
import { toast } from "sonner";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import {
  EXPLORE_ORDERS,
  foldSearchText,
  matchesExploreQuery,
  sortExploreGroups,
  type ExploreGroup,
  type ExploreLive,
  type ExploreOrder,
  type ExplorePost,
} from "@/lib/play-groups/explore.ts";

import { togglePlayGroupFollow } from "../[playGroupId]/actions.ts";
import Escu from "./Escu.tsx";

/**
 * Le rôle d'armes : la page d'exploration des groupes de jeu.
 *
 * Trois mouvements, du plus vivant au plus complet — les directs, les
 * publications, puis le rôle lui-même. Une recherche en cours efface les deux
 * premiers : on cherche un groupe, on ne veut pas dérouler deux vitrines avant
 * d'atteindre la liste.
 *
 * Le classement et la recherche se font ici, en mémoire, sur une liste bornée
 * côté base. C'est ce qui rend le champ instantané ; au-delà de cette borne,
 * c'est une pagination qu'il faudra, pas un tri plus malin.
 */
export default function ExploreRoll({
  groups,
  lives,
  posts,
  followedIds,
  isAuthenticated,
  now,
}: {
  groups: ExploreGroup[];
  lives: ExploreLive[];
  posts: ExplorePost[];
  followedIds: string[];
  isAuthenticated: boolean;
  /** Figé au rendu du serveur : deux horloges donneraient deux textes. */
  now: number;
}) {
  const t = useTranslations("PlayGroups.explore");

  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<ExploreOrder>("vifs");
  const [origin, setOrigin] = useState<{ longitude: number; latitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [followed, setFollowed] = useState(() => new Set(followedIds));

  const searching = query.trim().length > 0;

  const results = useMemo(() => {
    const folded = foldSearchText(query);
    return sortExploreGroups(
      groups.filter((group) => matchesExploreQuery(group, folded)),
      order,
      origin,
    );
  }, [groups, query, order, origin]);

  /**
   * La position ne sert qu'au classement, et n'est jamais envoyée : la distance
   * se calcule ici, sur des coordonnées de lieux déjà publiques.
   */
  const locate = () => {
    if (origin) {
      setOrder("proches");
      return;
    }

    // Sans position, l'ordre ne bascule pas : annoncer un classement par
    // distance qui n'est pas appliqué vaut moins que de dire qu'on ne sait pas.
    if (!navigator.geolocation) {
      toast.error(t("locateError"));
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setOrigin({ longitude: position.coords.longitude, latitude: position.coords.latitude });
        setOrder("proches");
      },
      () => {
        setLocating(false);
        toast.error(t("locateError"));
      },
    );
  };

  return (
    <div className="container mx-auto max-w-[1120px] px-4 pb-16 lg:px-6">
      <header className="flex flex-col items-center gap-3.5 pt-12 pb-7 text-center">
        <span className="font-mono text-[11px] tracking-[.34em] text-[var(--or-text)] uppercase">{t("eyebrow")}</span>
        <h1 className="font-[family-name:var(--font-cinzel)] text-4xl font-bold tracking-[.012em] text-balance sm:text-5xl">
          {t("title")}
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-pretty text-muted-foreground">{t("subtitle")}</p>
        <span className="play-group-fleuron flex w-full items-center gap-3.5 pt-1.5">
          <i className="size-[7px] shrink-0 rotate-45 bg-[var(--or)]" aria-hidden />
        </span>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-5 pb-5">
        <label className="flex min-w-[280px] flex-1 items-center gap-2.5 border-b border-[var(--or-line)] pb-1.5">
          <Search className="size-[17px] shrink-0 text-[var(--or-text)]" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            className="w-full bg-transparent font-[family-name:var(--font-cinzel)] text-lg outline-none placeholder:font-sans placeholder:text-[15px] placeholder:text-muted-foreground"
          />
        </label>

        <div className="flex flex-wrap items-center gap-5 pb-2">
          {EXPLORE_ORDERS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={order === key}
              onClick={() => (key === "proches" ? locate() : setOrder(key))}
              className={cn(
                "border-b pb-1 font-mono text-[11px] tracking-[.2em] uppercase transition-colors",
                order === key
                  ? "border-[var(--or)] text-[var(--or-text)]"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {locating && key === "proches" ? t("locating") : t(`orders.${key}`)}
            </button>
          ))}

          {order === "proches" && !origin && !locating && (
            <button
              type="button"
              onClick={locate}
              className="flex items-center gap-1.5 font-mono text-[11px] tracking-[.14em] text-muted-foreground uppercase hover:text-foreground"
            >
              <LocateFixed className="size-3.5" aria-hidden />
              {t("locate")}
            </button>
          )}
        </div>
      </div>

      {!searching && lives.length > 0 && <LiveWall lives={lives} now={now} />}
      {!searching && posts.length > 0 && <Heralds posts={posts} now={now} />}

      <Movement title={searching ? t("roll.resultsTitle") : t("roll.title")} aside={t(`orderNotice.${order}`)} />

      <p className="pb-2 font-mono text-[11px] tracking-[.12em] text-muted-foreground uppercase">
        {t("roll.count", { count: results.length })}
      </p>

      {results.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="play-group-fleuron flex w-full max-w-md items-center gap-3.5">
            <i className="size-[7px] shrink-0 rotate-45 bg-[var(--or)]" aria-hidden />
          </span>
          <p className="font-[family-name:var(--font-cinzel)] text-xl text-muted-foreground">{t("roll.empty")}</p>
          <Button variant="outline" size="sm" onClick={() => setQuery("")}>
            {t("roll.reset")}
          </Button>
        </div>
      ) : (
        <div>
          {results.map((group) => (
            <RollEntry
              key={group.id}
              group={group}
              now={now}
              isFollowed={followed.has(group.id)}
              isAuthenticated={isAuthenticated}
              onFollowed={(next) =>
                setFollowed((current) => {
                  const updated = new Set(current);
                  if (next) {
                    updated.add(group.id);
                  } else {
                    updated.delete(group.id);
                  }
                  return updated;
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Le titre d'un mouvement, son filet et sa mention en petite capitale. */
function Movement({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="flex items-center gap-4.5 pt-11 pb-5">
      <h2 className="font-[family-name:var(--font-cinzel)] text-[26px] font-semibold tracking-[.02em] whitespace-nowrap">
        {title}
      </h2>
      <span className="h-px flex-1 bg-gradient-to-r from-[var(--or-line)] to-transparent" aria-hidden />
      {aside && (
        <span className="hidden font-mono text-[11px] tracking-[.16em] text-muted-foreground uppercase sm:block">
          {aside}
        </span>
      )}
    </div>
  );
}

/** ── 1. En lice : qui diffuse en ce moment ─────────────────────────────── */
function LiveWall({ lives, now }: { lives: ExploreLive[]; now: number }) {
  const t = useTranslations("PlayGroups.explore");
  const [featured, ...rest] = lives;

  // Un groupe dont trois membres diffusent reste un groupe : la mention compte
  // des groupes, pas des flux.
  const groupCount = new Set(lives.map((live) => live.groupId)).size;

  return (
    <section>
      <Movement title={t("live.title")} aside={t("live.count", { count: groupCount })} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,740fr)_minmax(0,360fr)]">
        <LiveScreen live={featured} now={now} />

        {rest.length > 0 && (
          <div className="flex flex-col gap-3">
            {rest.slice(0, 2).map((live) => (
              <LiveScreen key={`${live.groupId}-${live.channelUrl}`} live={live} now={now} compact />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function LiveScreen({ live, now, compact }: { live: ExploreLive; now: number; compact?: boolean }) {
  const t = useTranslations("PlayGroups.explore");
  const format = useFormatter();

  // Le temps relatif se suffit : le composer avec « depuis » donnerait
  // « depuis il y a une heure ».
  const meta = [live.streamer, live.gameName, format.relativeTime(new Date(live.startedAt), now)]
    .filter(Boolean)
    .join(" · ");

  return (
    <a
      href={live.channelUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={live.accentColor ? ({ "--group-accent": live.accentColor } as React.CSSProperties) : undefined}
      className="play-group-theme group relative block aspect-video overflow-hidden rounded-[3px] border border-[var(--or-faint)] bg-muted transition-colors hover:border-[var(--or-line)]"
    >
      {/* La vignette servie par Twitch ou YouTube. Une balise nue : leurs hôtes
          ne sont pas déclarés dans `next.config.ts`, et le semé du groupe reste
          dessous quand l'image ne charge pas. */}
      <span className="play-group-seme absolute inset-0" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={live.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />

      <span className="play-group-corner" data-corner="tl" aria-hidden />
      <span className="play-group-corner" data-corner="br" aria-hidden />
      {!compact && (
        <>
          <span className="play-group-corner" data-corner="tr" aria-hidden />
          <span className="play-group-corner" data-corner="bl" aria-hidden />
        </>
      )}

      <span className="absolute top-3 left-3 inline-flex items-center gap-[7px] bg-red-500 px-2.5 py-1 font-mono text-[10px] font-medium tracking-[.16em] text-white uppercase [clip-path:polygon(0_0,100%_0,100%_100%,6px_100%,0_calc(100%-6px))]">
        <span className="size-[5px] animate-pulse rounded-full bg-white" aria-hidden />
        {t("live.badge")}
      </span>

      {typeof live.viewers === "number" && (
        <span className="absolute top-3 right-3 border border-[var(--or-faint)] bg-black/75 px-2.5 py-1 font-mono text-[11px] text-white">
          {t("live.viewers", { count: live.viewers })}
        </span>
      )}

      <span
        className={cn(
          "absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--or)] bg-black/45 text-[var(--or)] backdrop-blur-[2px] transition-transform group-hover:scale-105",
          compact ? "size-10" : "size-[58px]",
        )}
        aria-hidden
      >
        <Play className={compact ? "size-3.5 translate-x-px" : "size-5 translate-x-0.5"} fill="currentColor" />
      </span>

      <span className="absolute inset-x-0 bottom-0 flex items-end gap-3.5 bg-gradient-to-t from-black/95 via-black/55 to-transparent px-4 pt-10 pb-3.5">
        <Escu initials={live.initials} size={compact ? "sm" : "md"} className="mb-0.5" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className={cn(
              "truncate font-[family-name:var(--font-cinzel)] font-semibold text-white",
              compact ? "text-[15px]" : "text-[22px]",
            )}
          >
            {live.groupName}
          </span>
          <span className="truncate font-mono text-[11px] tracking-[.08em] text-white/70">{meta}</span>
        </span>
      </span>
    </a>
  );
}

/** ── 2. Les hérauts : ce que les groupes publient ──────────────────────── */
function Heralds({ posts, now }: { posts: ExplorePost[]; now: number }) {
  const t = useTranslations("PlayGroups.explore");
  const format = useFormatter();

  return (
    <section>
      <Movement title={t("heralds.title")} aside={t("heralds.subtitle")} />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => {
          const inner = (
            <>
              <span
                className="play-group-seme relative block h-[158px] border-b border-[var(--or-faint)] bg-muted"
                aria-hidden
              >
                {post.thumbnail && (
                  // L'image de couverture choisie par l'auteur ; le semé reste
                  // dessous quand elle manque ou ne charge pas.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.thumbnail} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                )}
                <span className="absolute bottom-3 left-3 border border-[var(--or-faint)] bg-background/85 px-2.5 py-1 font-mono text-[10px] tracking-[.18em] text-[var(--or-text)] uppercase">
                  {t(`heralds.kinds.${post.kind}`)}
                </span>
                {post.duration && (
                  <span className="absolute right-3 bottom-3 bg-background/85 px-2.5 py-1 font-mono text-[10px]">
                    {post.duration}
                  </span>
                )}
              </span>

              <span className="flex flex-1 flex-col gap-2.5 px-4 pt-4 pb-3.5">
                <span className="font-[family-name:var(--font-cinzel)] text-[19px] leading-snug font-semibold text-pretty">
                  {post.title}
                </span>
                {post.summary && (
                  <span className="line-clamp-2 text-[13px] leading-relaxed text-pretty text-muted-foreground">
                    {post.summary}
                  </span>
                )}
                <span className="mt-auto flex items-center gap-2.5 border-t border-[var(--or-faint)] pt-3">
                  <Escu initials={post.initials} size="sm" />
                  <span className="truncate font-mono text-[10px] tracking-[.1em] text-muted-foreground uppercase">
                    <b className="font-medium text-[var(--group-accent-text)]">{post.groupName}</b>
                    {" · "}
                    {format.relativeTime(new Date(post.publishedAt), now)}
                  </span>
                </span>
              </span>
            </>
          );

          const className =
            "play-group-theme flex flex-col overflow-hidden rounded-[3px] border border-[var(--or-faint)] bg-card transition-[transform,border-color] hover:-translate-y-0.5 hover:border-[var(--or-line)]";
          const style = post.accentColor
            ? ({ "--group-accent": post.accentColor } as React.CSSProperties)
            : undefined;

          return post.href ? (
            <Link key={post.id} href={post.href} className={className} style={style}>
              {inner}
            </Link>
          ) : (
            <a
              key={post.id}
              href={post.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={className}
              style={style}
            >
              {inner}
            </a>
          );
        })}
      </div>
    </section>
  );
}

/** ── 3. Le rôle : une entrée par groupe ────────────────────────────────── */
function RollEntry({
  group,
  now,
  isFollowed,
  isAuthenticated,
  onFollowed,
}: {
  group: ExploreGroup;
  now: number;
  isFollowed: boolean;
  isAuthenticated: boolean;
  onFollowed: (next: boolean) => void;
}) {
  const t = useTranslations("PlayGroups.explore");
  const format = useFormatter();
  const [pending, startTransition] = useTransition();

  const live = group.lives[0];
  // Le compteur de spectateurs n'est renseigné nulle part aujourd'hui : sans
  // lui, on dit qui diffuse, pas « 0 spectateurs ».
  const cry = live
    ? typeof live.viewers === "number"
      ? t("entry.liveCry", { streamer: live.streamer, count: live.viewers })
      : t("entry.liveCryPlain", { streamer: live.streamer })
    : group.lastDeed
      ? t(`entry.deeds.${group.lastDeed.kind}`, {
          at: format.relativeTime(new Date(group.lastDeed.at), now),
          title: group.lastDeed.label ?? "",
        })
      : t("entry.quiet");

  const follow = () => {
    // L'état bascule tout de suite : c'est une préférence sans conséquence, et
    // attendre l'aller-retour ne ferait que clignoter. La même règle que sur la
    // vitrine du groupe.
    const next = !isFollowed;
    onFollowed(next);

    startTransition(async () => {
      const result = await togglePlayGroupFollow(group.id);
      if (!result.success) {
        onFollowed(!next);
        toast.error(t("entry.followError"));
      }
    });
  };

  return (
    <article
      style={group.accentColor ? ({ "--group-accent": group.accentColor } as React.CSSProperties) : undefined}
      className="play-group-theme group flex flex-wrap items-start gap-6 border-b border-[var(--or-faint)] py-5.5 pr-5 transition-[background,padding] hover:bg-gradient-to-r hover:from-[var(--group-accent-10)] hover:to-transparent hover:pl-3.5"
    >
      <Escu initials={group.initials} logo={group.logo} live={!!live} liveLabel={t("live.badge")} size="lg" />

      <div className="flex min-w-[260px] flex-1 flex-col gap-2.5">
        <h3 className="font-[family-name:var(--font-cinzel)] text-[26px] leading-tight font-semibold">
          <Link href={`/play-groups/${group.id}`} className="hover:underline">
            {group.name}
          </Link>
        </h3>

        {group.tagline && (
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground italic">{group.tagline}</p>
        )}

        <p
          className={cn(
            "flex items-center gap-2.5 text-[13px]",
            live ? "text-red-400" : group.lastDeed ? "text-[var(--group-accent-text)]" : "text-muted-foreground/75",
          )}
        >
          {live ? (
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
          ) : (
            !group.lastDeed && <Clock className="size-[15px] shrink-0" aria-hidden />
          )}
          {cry}
        </p>

        <div className="flex flex-wrap items-center text-[13px] text-muted-foreground">
          {group.rhythmLabel && (
            <span className="flex items-center gap-1.5 pr-4">
              <Repeat className="size-3.5 shrink-0 text-[var(--or-text)]" aria-hidden />
              {group.rhythmLabel}
            </span>
          )}

          {group.place?.label && (
            <span className="flex items-center gap-1.5 border-l border-[var(--or-faint)] px-4 first:border-l-0 first:pl-0">
              <MapPin className="size-3.5 shrink-0 text-[var(--or-text)]" aria-hidden />
              {group.place.label}
              {!group.placeCoordinates && <em className="opacity-70">{t("entry.noPlace")}</em>}
            </span>
          )}

          {group.gameNames.length > 0 && (
            <span className="border-l border-[var(--or-faint)] px-4 font-mono text-[11px] tracking-[.1em] text-[var(--group-accent-text)] uppercase first:border-l-0 first:pl-0">
              {group.gameNames.slice(0, 3).join(" · ")}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-3 pt-1">
        <div className="flex gap-4 text-right font-mono text-[11px] tracking-[.08em] text-muted-foreground">
          <span>
            <b className="block text-[17px] font-medium tracking-normal text-foreground">{group.memberCount}</b>
            {t("entry.members", { count: group.memberCount })}
          </span>
          <span>
            <b className="block text-[17px] font-medium tracking-normal text-foreground">{group.followerCount}</b>
            {t("entry.followers", { count: group.followerCount })}
          </span>
          <span>
            <b className="block text-[17px] font-medium tracking-normal text-foreground">{group.publishedCount}</b>
            {t("entry.published", { count: group.publishedCount })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={follow}
              disabled={pending}
              aria-pressed={isFollowed}
              className={cn(
                "border px-3.5 py-2.5 font-mono text-[10px] tracking-[.16em] uppercase transition-colors disabled:opacity-60",
                isFollowed
                  ? "border-[var(--or)] bg-[var(--or)] font-medium text-[#17130c]"
                  : "border-[var(--or-line)] text-foreground hover:text-[var(--or-text)]",
              )}
            >
              {isFollowed ? t("entry.following") : t("entry.follow")}
            </button>
          ) : (
            <Link
              href="/login"
              className="border border-[var(--or-line)] px-3.5 py-2.5 font-mono text-[10px] tracking-[.16em] uppercase transition-colors hover:text-[var(--or-text)]"
            >
              {t("entry.signIn")}
            </Link>
          )}

          <Link
            href={`/play-groups/${group.id}`}
            className="px-1 py-2.5 font-mono text-[10px] tracking-[.16em] text-[var(--or-text)] uppercase transition-colors hover:text-foreground"
          >
            {t("entry.enter")}
          </Link>
        </div>
      </div>
    </article>
  );
}
