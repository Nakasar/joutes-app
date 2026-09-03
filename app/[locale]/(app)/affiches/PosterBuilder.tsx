"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { BookMarked, ChevronLeft, ChevronRight, ExternalLink, Loader2, Lock, MapPin, Plus, Printer, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { getPathname } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { cn } from "@/lib/utils.ts";
import { POSTER_ZONE } from "@/lib/posters/period.ts";
import { MAX_POSTER_LAIRS } from "@/lib/posters/selection.ts";
import { canSavePoster, MAX_POSTER_NAME, posterLimitFor } from "@/lib/posters/limits.ts";
import {
  DEFAULT_POSTER_STYLE,
  POSTER_STYLE_KEYS,
  POSTER_STYLES,
  type PosterPeriod,
  type PosterStyleKey,
} from "@/lib/posters/styles.ts";

import { deleteMyPoster, saveMyPoster, type SavePosterError } from "./poster-actions.ts";

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

/**
 * Une affiche gardée, telle que l'écran la reprend.
 *
 * Ses lieux sont résolus par le serveur, et non ses seuls identifiants : c'est
 * ce qui permet de la rouvrir d'un clic, sans aller redemander leurs noms. La
 * date n'y est pas — une affiche gardée est une recette, et rouvrir la sienne
 * doit montrer la semaine où l'on est, pas celle où on l'a enregistrée.
 */
export type BuilderPoster = {
  id: string;
  name: string;
  lairs: BuilderLair[];
  gameIds: string[];
  period: PosterPeriod;
  style: PosterStyleKey;
  showAttendance: boolean;
  gameLogos: boolean;
};

const SAVE_ERROR_KEYS: Record<SavePosterError, string> = {
  UNAUTHENTICATED: "library.errors.unauthenticated",
  INVALID: "library.errors.invalid",
  LIMIT_REACHED: "library.errors.limit",
  NAME_TAKEN: "library.errors.nameTaken",
  NOT_FOUND: "library.errors.notFound",
  FAILED: "library.errors.failed",
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
  saved,
  unlimited,
}: {
  myLairs: BuilderLair[];
  games: BuilderGame[];
  /** Joutes Expert ou Joutes Pro : les quatre styles réservés s'ouvrent. */
  unlocked: boolean;
  /** Les affiches gardées, ou `null` quand personne n'est connecté. */
  saved: BuilderPoster[] | null;
  /** Joutes Expert ou Joutes Pro : le compte en garde autant qu'il veut. */
  unlimited: boolean;
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

  // La bibliothèque, tenue localement à partir de ce que le serveur a rendu :
  // l'action renvoie l'affiche écrite, et la liste se corrige sans recharger la
  // page. `revalidatePath` la refera de toute façon au prochain rendu.
  const [library, setLibrary] = useState<BuilderPoster[]>(saved ?? []);
  /** L'affiche gardée qu'on est en train de reprendre, s'il y en a une. */
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  /** Le geste en cours, pour que le rouet ne tourne que sur le bouton pressé. */
  const [isSaving, setIsSaving] = useState<"update" | "create" | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

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

        if (abort.current === controller) {
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
        }
      } catch (error) {
        // Une frappe de plus a annulé celle-ci : ce n'est pas un échec.
        if (!(error instanceof DOMException && error.name === "AbortError") && abort.current === controller) {
          setResults([]);
        }
      } finally {
        // Seule la recherche encore en cours décide de l'indicateur. Celle
        // qu'une frappe vient d'annuler se termine **après** que la suivante a
        // démarré : l'éteindre ici arrêtait le rouet alors qu'on cherchait
        // encore, et la liste semblait complète avant de l'être.
        if (abort.current === controller) {
          setIsSearching(false);
        }
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

  /**
   * Reprendre une affiche gardée : ses lieux, ses jeux, son habillage — mais
   * la période part d'aujourd'hui. C'est ce qui fait qu'on la rouvre chaque
   * semaine sans rien retoucher.
   */
  const load = (poster: BuilderPoster) => {
    setSelected(poster.lairs);
    setGameIds(poster.gameIds);
    setPeriod(poster.period);
    setStart(DateTime.now().setZone(POSTER_ZONE).startOf("day"));
    setStyle(poster.style);
    setShowAttendance(poster.showAttendance);
    setGameLogos(poster.gameLogos);
    setEditing(poster.id);
    setName(poster.name);
  };

  /** Repartir d'une page blanche, sans toucher à ce qui est enregistré. */
  const unload = () => {
    setEditing(null);
    setName("");
  };

  const save = async (mode: "update" | "create") => {
    setIsSaving(mode);

    try {
      const result = await saveMyPoster(
        {
          name,
          lairIds: selected.map((lair) => lair.id),
          gameIds: keptGameIds,
          period,
          style,
          showAttendance,
          gameLogos,
        },
        mode === "update" ? (editing ?? undefined) : undefined,
      );

      if (!result.success) {
        toast.error(t(SAVE_ERROR_KEYS[result.error]));
        return;
      }

      const poster: BuilderPoster = {
        id: result.poster.id,
        name: result.poster.name,
        lairs: selected,
        gameIds: result.poster.gameIds,
        period: result.poster.period,
        style: result.poster.style,
        showAttendance: result.poster.showAttendance,
        gameLogos: result.poster.gameLogos,
      };

      setLibrary((current) => [poster, ...current.filter((entry) => entry.id !== poster.id)]);
      setEditing(poster.id);
      setStyle(poster.style);
      toast.success(t(mode === "update" ? "library.updated" : "library.saved"));
    } finally {
      setIsSaving(null);
    }
  };

  const forget = async (poster: BuilderPoster) => {
    setIsDeleting(poster.id);

    try {
      const result = await deleteMyPoster(poster.id);

      if (!result.success) {
        toast.error(t(SAVE_ERROR_KEYS[result.error]));
        return;
      }

      setLibrary((current) => current.filter((entry) => entry.id !== poster.id));

      if (editing === poster.id) {
        unload();
      }

      toast.success(t("library.deleted"));
    } finally {
      setIsDeleting(null);
    }
  };

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
  /** Une affiche se garde quand elle a un nom et au moins un lieu. */
  const canSave = hasSelection && name.trim().length > 0;
  /**
   * La place restante se calcule **ici**, sur la bibliothèque qu'on a sous les
   * yeux, et non sur un booléen que le serveur aurait figé au chargement :
   * supprimer une affiche libère la place aussitôt. La règle est la même des
   * deux côtés — `canSavePoster` —, et c'est bien le serveur qui tranche à
   * l'écriture ; l'écran ne fait que ne pas mentir en attendant.
   */
  const canSaveMore = canSavePoster({ existing: library.length, unlimited });
  const limit = posterLimitFor(unlimited);
  // Une frappe assez longue pour que l'annuaire ait été interrogé.
  const searching = query.trim().length >= 2;
  const suggestions = myLairs.filter((lair) => !selected.some((entry) => entry.id === lair.id));
  const found = results.filter((lair) => !selected.some((entry) => entry.id === lair.id));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_460px]">
      <div className="flex flex-col gap-6">
        {/* La bibliothèque : ce qu'on a gardé, et par quoi on revient. Elle ne
            s'affiche que pour un visiteur connecté — sans compte, il n'y a rien
            à garder ni personne à qui l'attribuer. */}
        {saved !== null && library.length > 0 && (
          <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <header className="flex flex-col gap-1">
              <h3 className="inline-flex items-center gap-2 text-base font-semibold">
                <BookMarked className="size-4 text-muted-foreground" aria-hidden />
                {t("library.title")}
              </h3>
              <p className="text-[13px] text-muted-foreground">{t("library.description")}</p>
            </header>

            <ul className="flex flex-col gap-2">
              {library.map((poster) => {
                const current = editing === poster.id;

                return (
                  <li
                    key={poster.id}
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-lg border p-3",
                      current && "border-primary/50 bg-primary/5",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => load(poster)}
                      aria-pressed={current}
                      className="flex min-w-0 flex-1 flex-col items-start text-left"
                    >
                      <span className="truncate text-[13px] font-medium">{poster.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {t("library.summary", {
                          lairs: poster.lairs.length,
                          period: t(`period.${poster.period}`),
                          style: tStyles(`${poster.style}.name`),
                        })}
                      </span>
                    </button>
                    {/* Une affiche gardée ne se perd pas d'un clic : ne pas
                        avoir à la recomposer est tout ce qu'elle sert. */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          disabled={isDeleting === poster.id}
                          aria-label={t("library.delete", { name: poster.name })}
                        >
                          {isDeleting === poster.id ? (
                            <Loader2 className="animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="size-3.5" aria-hidden />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("library.confirm.title")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("library.confirm.description", { name: poster.name })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("library.confirm.cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => forget(poster)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {t("library.confirm.action")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </li>
                );
              })}
            </ul>

            {editing !== null && (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={unload}>
                  {t("library.startFresh")}
                </Button>
              </div>
            )}
          </section>
        )}

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

        {/* Garder l'affiche. Sous l'export, parce qu'on règle d'abord et qu'on
            garde ensuite ; au-dessus, parce qu'on y revient plus souvent qu'on
            n'imprime. */}
        {saved !== null && (
          <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <header className="flex flex-col gap-1">
              <h3 className="text-base font-semibold">{t("library.save.title")}</h3>
              <p className="text-[13px] text-muted-foreground">
                {limit === null ? t("library.save.description") : t("library.save.limited")}
              </p>
            </header>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="poster-name">{t("library.save.name")}</Label>
              <Input
                id="poster-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("library.save.placeholder")}
                maxLength={MAX_POSTER_NAME}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Reprendre une affiche gardée offre les deux gestes : la
                  corriger, ou en tirer une seconde. Sans elle, il n'y en a
                  qu'un. */}
              {editing !== null && (
                <Button type="button" disabled={!canSave || isSaving !== null} onClick={() => save("update")}>
                  {isSaving === "update" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                  {t("library.save.update")}
                </Button>
              )}
              <Button
                type="button"
                variant={editing === null ? "default" : "outline"}
                disabled={!canSave || isSaving !== null || !canSaveMore}
                onClick={() => save("create")}
              >
                {isSaving === "create" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                {editing === null ? t("library.save.action") : t("library.save.asNew")}
              </Button>
            </div>

            {/* La limite se dit là où elle s'applique, et seulement quand elle
                mord : le bouton grisé sans explication laisserait chercher. */}
            {!canSaveMore && limit !== null && (
              <p className="text-[13px] text-muted-foreground">{t("library.save.reached", { limit })}</p>
            )}
            {!hasSelection && <p className="text-[13px] text-muted-foreground">{t("library.save.needLair")}</p>}
          </section>
        )}

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
              // Ni au clavier, ni à la synthèse vocale : la souris n'y touche
              // déjà pas, et une tabulation y tombait sans rien pouvoir y
              // faire. L'affiche ne redit d'ailleurs que ce que les réglages
              // ci-contre annoncent déjà.
              tabIndex={-1}
              aria-hidden
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
