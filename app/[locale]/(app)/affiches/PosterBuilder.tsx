"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Lock, MapPin, Plus, Printer, Search, X } from "lucide-react";

import { getPathname } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { cn } from "@/lib/utils.ts";
import { POSTER_ZONE } from "@/lib/posters/period.ts";
import { MAX_POSTER_LAIRS } from "@/lib/posters/selection.ts";
import {
  DEFAULT_POSTER_STYLE,
  POSTER_STYLE_KEYS,
  POSTER_STYLES,
  type PosterPeriod,
  type PosterStyleKey,
} from "@/lib/posters/styles.ts";

/** Un lieu, réduit à ce que l'écran en montre et en envoie. */
export type BuilderLair = {
  id: string;
  name: string;
  address?: string;
  /** Les identifiants de ses jeux — le choix des jeux s'en déduit. */
  games: string[];
};

/**
 * Un jeu, tel que le sélecteur le montre : son nom et sa couleur.
 *
 * Pas son logo — il vient d'hôtes quelconques, que `next/image` n'a pas
 * autorisés, et une pastille de couleur suffit à distinguer une ligne de
 * l'autre. Les logos, eux, vivent sur l'affiche elle-même, hors de `next/image`.
 */
export type BuilderGame = {
  id: string;
  slug?: string;
  name: string;
  color?: string;
};

/** L'affiche est dessinée à cette taille ; l'aperçu la réduit à sa colonne. */
const POSTER_WIDTH = 794;
const POSTER_HEIGHT = 1123;
const PREVIEW_WIDTH = 420;

/** Le temps qu'on laisse à une frappe avant d'interroger l'annuaire. */
const SEARCH_DELAY_MS = 300;

/**
 * Le composeur d'affiches : des lieux, des jeux, une période, un style.
 *
 * Rien ne s'enregistre. L'affiche **est** son adresse — `/affiche?lairs=…` —,
 * ce qui la rend partageable telle quelle, réimprimable la semaine suivante en
 * changeant un paramètre, et dispense la base d'un document de plus. L'écran
 * n'est donc qu'un constructeur d'URL avec son aperçu : il n'a ni bouton
 * « enregistrer », ni état à réconcilier avec le serveur.
 *
 * Le pied de page ne s'y règle pas : une affiche qui réunit les lieux d'autrui
 * ne signe au nom de personne, et garde l'emblème Joutes avec un QR code vers
 * joutes.app. C'est la seule différence de fond avec l'affiche d'un lieu.
 */
export default function PosterBuilder({
  myLairs,
  games,
  unlocked,
}: {
  myLairs: BuilderLair[];
  games: BuilderGame[];
  /** Joutes Expert ou Joutes Pro : les quatre styles réservés s'ouvrent. */
  unlocked: boolean;
}) {
  const t = useTranslations("Posters");
  const tStyles = useTranslations("Lairs.poster.styles");
  const locale = useLocale();

  const [selected, setSelected] = useState<BuilderLair[]>([]);
  const [gameIds, setGameIds] = useState<string[]>([]);
  const [period, setPeriod] = useState<PosterPeriod>("week");
  // Dans le fuseau des lieux, pas celui du navigateur : un joueur en voyage
  // doit voir la même semaine que son affiche.
  const [start, setStart] = useState(() => DateTime.now().setZone(POSTER_ZONE).startOf("day"));
  const [style, setStyle] = useState<PosterStyleKey>(DEFAULT_POSTER_STYLE);
  const [showAttendance, setShowAttendance] = useState(true);
  const [gameLogos, setGameLogos] = useState(true);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BuilderLair[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const isFull = selected.length >= MAX_POSTER_LAIRS;

  /**
   * Les jeux qu'on peut cocher : ceux des lieux retenus, et eux seuls.
   *
   * Un catalogue entier ferait cocher des jeux qu'aucun des lieux ne propose,
   * donc une affiche vide sans qu'on comprenne pourquoi.
   */
  const availableGames = useMemo(() => {
    const ids = new Set(selected.flatMap((lair) => lair.games));

    return games.filter((game) => ids.has(game.id));
  }, [games, selected]);

  // Un jeu coché puis devenu hors sujet — son lieu a été retiré — ne doit pas
  // continuer à filtrer l'affiche depuis l'ombre.
  const keptGameIds = useMemo(
    () => gameIds.filter((id) => availableGames.some((game) => game.id === id)),
    [gameIds, availableGames],
  );

  // La recherche dans l'annuaire, une fois la frappe retombée. `GET /api/lairs`
  // applique lui-même la visibilité : un lieu privé qu'on ne possède pas n'en
  // ressort pas.
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const search = query.trim();

    if (search.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      try {
        const response = await fetch(`/api/lairs?limit=8&search=${encodeURIComponent(search)}`, {
          signal: controller.signal,
        });
        const payload = await response.json();

        setResults(
          Array.isArray(payload?.lairs)
            ? payload.lairs.map((lair: BuilderLair) => ({
                id: lair.id,
                name: lair.name,
                address: lair.address,
                games: lair.games ?? [],
              }))
            : [],
        );
      } catch (error) {
        // Une frappe de plus a annulé celle-ci : ce n'est pas un échec.
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DELAY_MS);

    return () => {
      clearTimeout(timer);
      abort.current?.abort();
    };
  }, [query]);

  const add = (lair: BuilderLair) =>
    setSelected((current) =>
      current.some((entry) => entry.id === lair.id) || current.length >= MAX_POSTER_LAIRS
        ? current
        : [...current, lair],
    );

  const remove = (lairId: string) => setSelected((current) => current.filter((entry) => entry.id !== lairId));

  const toggleGame = (gameId: string) =>
    setGameIds((current) =>
      current.includes(gameId) ? current.filter((id) => id !== gameId) : [...current, gameId],
    );

  const periodLabel = useMemo(() => {
    const localized = start.setLocale(locale);

    if (period === "month") {
      return localized.toFormat("LLLL yyyy");
    }

    // Des semaines ISO, du lundi au dimanche, comme l'affiche.
    const first = localized.startOf("week", { useLocaleWeeks: false });
    const last = localized.endOf("week", { useLocaleWeeks: false });

    return `${first.toFormat("d")} – ${last.toFormat("d LLLL yyyy")}`;
  }, [period, start, locale]);

  const shift = (direction: 1 | -1) =>
    setStart((current) => (period === "week" ? current.plus({ weeks: direction }) : current.plus({ months: direction })));

  const posterHref = (extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({
      lairs: selected.map((lair) => lair.id).join(","),
      period,
      start: start.toISODate() ?? "",
      style,
      attendance: showAttendance ? "1" : "0",
      logos: gameLogos ? "1" : "0",
      // Aucun jeu coché vaut « tous les jeux » : le paramètre disparaît plutôt
      // que de porter une liste vide, qui ne se distinguerait pas d'un filtre.
      ...(keptGameIds.length > 0 ? { games: keptGameIds.join(",") } : {}),
      ...extra,
    });

    return `${getPathname({ locale, href: "/affiche" })}?${params.toString()}`;
  };

  const scale = PREVIEW_WIDTH / POSTER_WIDTH;
  const hasSelection = selected.length > 0;
  // Une frappe assez longue pour que l'annuaire ait été interrogé.
  const searching = query.trim().length >= 2;
  const suggestions = myLairs.filter((lair) => !selected.some((entry) => entry.id === lair.id));
  const found = results.filter((lair) => !selected.some((entry) => entry.id === lair.id));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_460px]">
      <div className="flex flex-col gap-6">
        {/* Les lieux. */}
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <header className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">{t("lairs.title")}</h3>
            <p className="text-[13px] text-muted-foreground">{t("lairs.description", { max: MAX_POSTER_LAIRS })}</p>
          </header>

          {hasSelection && (
            <ul className="flex flex-wrap gap-2">
              {selected.map((lair) => (
                <li key={lair.id}>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/5 py-1 pl-2.5 pr-1 text-[13px]">
                    {lair.name}
                    <button
                      type="button"
                      onClick={() => remove(lair.id)}
                      aria-label={t("lairs.remove", { name: lair.name })}
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="poster-lair-search">{t("lairs.search")}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="poster-lair-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("lairs.searchPlaceholder")}
                className="pl-9"
                disabled={isFull}
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
              )}
            </div>
            {isFull && <p className="text-[13px] text-muted-foreground">{t("lairs.full", { max: MAX_POSTER_LAIRS })}</p>}
          </div>

          {/* Tant qu'on ne cherche pas, on propose ; dès qu'on cherche, on
              répond — y compris pour dire qu'on n'a rien trouvé. Montrer ses
              propres lieux sous une recherche infructueuse les ferait passer
              pour des résultats. */}
          {!isFull && searching && !isSearching && found.length === 0 && (
            <p className="text-[13px] text-muted-foreground">{t("lairs.noResults")}</p>
          )}

          {!isFull && (searching ? found.length > 0 : suggestions.length > 0) && (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                {searching ? t("lairs.results") : t("lairs.mine")}
              </span>
              <ul className="flex flex-col gap-1.5">
                {(searching ? found : suggestions).slice(0, 8).map((lair) => (
                  <li key={lair.id}>
                    <button
                      type="button"
                      onClick={() => add(lair)}
                      className="flex w-full items-center gap-2 rounded-lg border p-2.5 text-left transition-colors hover:bg-accent"
                    >
                      <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[13px] font-medium">{lair.name}</span>
                        {lair.address && (
                          <span className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <MapPin className="size-3 shrink-0" aria-hidden />
                            {lair.address}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!hasSelection && <p className="text-[13px] text-muted-foreground">{t("lairs.empty")}</p>}
        </section>

        {/* Les jeux. */}
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <header className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">{t("games.title")}</h3>
            <p className="text-[13px] text-muted-foreground">{t("games.description")}</p>
          </header>

          {availableGames.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t("games.empty")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableGames.map((game) => {
                const picked = keptGameIds.includes(game.id);

                return (
                  <button
                    key={game.id}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => toggleGame(game.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] transition-colors",
                      picked ? "border-primary/50 bg-primary/5 font-medium" : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: game.color || "#737373" }}
                      aria-hidden
                    />
                    {game.name}
                  </button>
                );
              })}
            </div>
          )}
          {keptGameIds.length === 0 && availableGames.length > 0 && (
            <p className="text-[13px] text-muted-foreground">{t("games.all")}</p>
          )}
        </section>

        {/* La période et le contenu. */}
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <header className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">{t("period.title")}</h3>
          </header>

          <div className="flex flex-col gap-2">
            <Label>{t("period.label")}</Label>
            <div role="group" aria-label={t("period.label")} className="flex w-fit gap-0.5 rounded-lg border bg-background p-[3px]">
              {(["week", "month"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  aria-pressed={period === value}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs whitespace-nowrap transition-colors",
                    period === value ? "bg-primary/10 font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`period.${value}`)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="icon-sm" onClick={() => shift(-1)} aria-label={t("period.previous")}>
                <ChevronLeft />
              </Button>
              <span className="min-w-[12rem] text-center text-sm font-medium capitalize">{periodLabel}</span>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => shift(1)} aria-label={t("period.next")}>
                <ChevronRight />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setStart(DateTime.now().setZone(POSTER_ZONE).startOf("day"))}>
                {t("period.today")}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Label>{t("content.label")}</Label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-sm">{t("content.attendance")}</span>
                <span className="text-[13px] text-muted-foreground">{t("content.attendanceHint")}</span>
              </div>
              <Switch checked={showAttendance} aria-label={t("content.attendance")} onCheckedChange={setShowAttendance} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-sm">{t("content.logos")}</span>
                <span className="text-[13px] text-muted-foreground">{t("content.logosHint")}</span>
              </div>
              <Switch checked={gameLogos} aria-label={t("content.logos")} onCheckedChange={setGameLogos} />
            </div>
          </div>
        </section>

        {/* Le style. */}
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <header className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">{t("style.title")}</h3>
            <p className="text-[13px] text-muted-foreground">{unlocked ? t("style.description") : t("style.locked")}</p>
          </header>

          <div className="grid gap-2 sm:grid-cols-2">
            {POSTER_STYLE_KEYS.map((key) => {
              const entry = POSTER_STYLES[key];
              const locked = entry.pro && !unlocked;
              const picked = style === key;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={locked}
                  aria-pressed={picked}
                  onClick={() => setStyle(key)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    picked ? "border-primary/50 bg-primary/5" : "hover:bg-accent",
                    locked && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className="flex h-10 w-11 shrink-0 overflow-hidden rounded-lg border" aria-hidden>
                    {entry.swatches.map((color) => (
                      <span key={color} className="flex-1" style={{ background: color }} />
                    ))}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
                      {tStyles(`${key}.name`)}
                      {entry.pro && (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                          <Lock className="size-3" aria-hidden />
                          {t("style.pro")}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">{tStyles(`${key}.hint`)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* L'export. */}
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <header className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">{t("export.title")}</h3>
            <p className="text-[13px] text-muted-foreground">{t("export.description")}</p>
          </header>
          {/* Sans lieu choisi, il n'y a pas d'affiche à ouvrir : de vrais
              boutons désactivés, et non des ancres portant un `disabled` que le
              HTML ignorerait. */}
          <div className="flex flex-wrap gap-2">
            <Button asChild={hasSelection} disabled={!hasSelection}>
              {hasSelection ? (
                <a href={posterHref({ print: "1" })} target="_blank" rel="noreferrer">
                  <Printer aria-hidden />
                  {t("export.print")}
                </a>
              ) : (
                <span>
                  <Printer aria-hidden />
                  {t("export.print")}
                </span>
              )}
            </Button>
            <Button asChild={hasSelection} disabled={!hasSelection} variant="outline">
              {hasSelection ? (
                <a href={posterHref()} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden />
                  {t("export.open")}
                </a>
              ) : (
                <span>
                  <ExternalLink aria-hidden />
                  {t("export.open")}
                </span>
              )}
            </Button>
          </div>
          <p className="text-[13px] text-muted-foreground">{t("export.hint")}</p>
        </section>
      </div>

      {/* L'aperçu : la vraie page, réduite. */}
      <aside className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{t("preview.title")}</span>
          <span className="text-[13px] text-muted-foreground">{t("preview.size")}</span>
        </div>
        <div
          className="relative overflow-hidden rounded-md border shadow-lg"
          style={{ width: PREVIEW_WIDTH, height: Math.round(POSTER_HEIGHT * scale), maxWidth: "100%" }}
        >
          {hasSelection ? (
            <iframe
              key={posterHref()}
              src={posterHref()}
              title={t("preview.title")}
              width={POSTER_WIDTH}
              height={POSTER_HEIGHT}
              className="absolute left-0 top-0 border-0"
              style={{ transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}
            />
          ) : (
            <p className="flex h-full items-center justify-center p-6 text-center text-[13px] text-muted-foreground">
              {t("preview.empty")}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
