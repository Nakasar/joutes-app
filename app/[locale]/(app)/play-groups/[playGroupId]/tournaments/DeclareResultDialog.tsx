"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { ArrowLeft, Check, Plus, Search, UserRound } from "lucide-react";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import type {
  JoutesTournamentSuggestion,
  LocatorEventSuggestion,
  LocatorPlayerSuggestion,
} from "@/lib/tournaments/result-service.ts";
import { cn } from "@/lib/utils.ts";

import {
  claimLocatorResultAction,
  declareResultAction,
  listMyDecksForResults,
  searchLocatorPlayersAction,
  searchResultTournamentsAction,
  type MyDeckForResult,
} from "./actions.ts";

const NONE = "__none";
const TOP_CUTS = [0, 4, 8, 16, 32] as const;

type Step =
  | { kind: "search" }
  | { kind: "claim"; event: LocatorEventSuggestion; player: LocatorPlayerSuggestion }
  | { kind: "form"; joutes?: JoutesTournamentSuggestion };

/**
 * « Déclarer un résultat » : chercher d'abord le tournoi, parmi ceux de Joutes
 * et ceux importés du locator, puis saisir à la main s'il n'y est pas.
 *
 * Dans un tournoi du locator, les joueurs dont le nom ressemble au mien sont
 * proposés ; « C'est moi » reprend leur place, leur bilan et leur légende.
 * Rien n'est jamais lié sans que je le confirme.
 */
export function DeclareResultDialog({
  gameNames,
  defaultGameId,
}: {
  gameNames: Record<string, string>;
  defaultGameId?: string;
}) {
  const t = useTranslations("PlayGroups.hub.tournaments");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "search" });
  const [gameId, setGameId] = useState(defaultGameId ?? Object.keys(gameNames)[0] ?? "");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ joutes: JoutesTournamentSuggestion[]; locator: LocatorEventSuggestion[] } | null>(
    null,
  );
  const [playerSearch, setPlayerSearch] = useState<{ eventId: string; query: string; players: LocatorPlayerSuggestion[] } | null>(
    null,
  );
  const [decks, setDecks] = useState<MyDeckForResult[] | null>(null);
  const [searching, startSearching] = useTransition();
  const [saving, startSaving] = useTransition();

  // Le formulaire libre.
  const [name, setName] = useState("");
  const [date, setDate] = useState(DateTime.now().toISODate() ?? "");
  const [place, setPlace] = useState("");
  const [placement, setPlacement] = useState("");
  const [playerCount, setPlayerCount] = useState("");
  const [wins, setWins] = useState("");
  const [losses, setLosses] = useState("");
  const [draws, setDraws] = useState("");
  const [topCut, setTopCut] = useState<number>(0);
  const [deckId, setDeckId] = useState(NONE);
  const [legendName, setLegendName] = useState("");
  const [visibility, setVisibility] = useState<"groups" | "public">("groups");

  const reset = () => {
    setStep({ kind: "search" });
    setQuery("");
    setFound(null);
    setPlayerSearch(null);
    setName("");
    setDate(DateTime.now().toISODate() ?? "");
    setPlace("");
    setPlacement("");
    setPlayerCount("");
    setWins("");
    setLosses("");
    setDraws("");
    setTopCut(0);
    setDeckId(NONE);
    setLegendName("");
    setVisibility("groups");
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      reset();
      if (decks === null) {
        listMyDecksForResults().then((result) => setDecks(result.success ? result.decks : []));
      }
    }
  };

  // La recherche part quand on s'arrête de taper.
  useEffect(() => {
    if (!open || step.kind !== "search") return;
    const text = query.trim();
    // Trop court : rien ne part, et la liste se masque au rendu.
    if (text.length < 2) return;
    const timer = setTimeout(() => {
      startSearching(async () => {
        const result = await searchResultTournamentsAction(text, gameId || undefined);
        setFound(result.success ? { joutes: result.joutes, locator: result.locator } : { joutes: [], locator: [] });
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, gameId, open, step.kind]);

  const searchPlayers = (eventId: string, text: string) => {
    setPlayerSearch((current) => ({ eventId, query: text, players: current?.eventId === eventId ? current.players : [] }));
    startSearching(async () => {
      const result = await searchLocatorPlayersAction(eventId, text);
      setPlayerSearch({ eventId, query: text, players: result.success ? result.players : [] });
    });
  };

  const gameDecks = (decks ?? []).filter((deck) => deck.gameId === gameId);
  const chosenDeck = gameDecks.find((deck) => deck.id === deckId);
  const formatDate = (iso: string) => DateTime.fromISO(iso).setLocale(locale).toLocaleString(DateTime.DATE_MED);

  const done = () => {
    toast.success(t("savedToast"));
    setOpen(false);
    router.refresh();
  };

  const fail = (error: string) => void toast.error(t(`errors.${error}` as "errors.FAILED"));

  const submit = () => {
    startSaving(async () => {
      if (step.kind === "claim") {
        const result = await claimLocatorResultAction({
          eventId: step.event.id,
          registrationId: step.player.registrationId,
          deckId: deckId === NONE ? undefined : deckId,
          visibility,
        });
        return result.success ? done() : fail(result.error);
      }

      const record = wins || losses || draws ? { wins: wins || 0, losses: losses || 0, draws: draws || 0 } : undefined;
      const result = await declareResultAction({
        ...(step.kind === "form" && step.joutes ? { joutesTournamentId: step.joutes.id } : { name, date, place, gameId }),
        placement,
        playerCount,
        topCut: topCut || undefined,
        record,
        deckId: deckId === NONE ? undefined : deckId,
        legendName: deckId === NONE ? legendName : undefined,
        visibility,
      });
      return result.success ? done() : fail(result.error);
    });
  };

  const deckField = (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="result-deck">{t("deckPlayed")}</Label>
      <Select value={deckId} onValueChange={setDeckId}>
        <SelectTrigger id="result-deck">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t("noDeckOption")}</SelectItem>
          {gameDecks.map((deck) => (
            <SelectItem key={deck.id} value={deck.id}>
              {deck.legendName ? `${deck.name} · ${deck.legendName}` : deck.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {chosenDeck ? t("deckVersionHint", { version: chosenDeck.version }) : t("deckHint")}
      </p>
    </div>
  );

  const visibilityField = (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{t("whoSees")}</legend>
      {(["groups", "public"] as const).map((value) => (
        <label
          key={value}
          className={cn(
            "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm",
            visibility === value && "border-primary bg-primary/10",
          )}
        >
          <input
            type="radio"
            name="result-visibility"
            value={value}
            checked={visibility === value}
            onChange={() => setVisibility(value)}
            className="mt-1 accent-primary"
          />
          <span className="flex flex-col">
            <span className="font-medium">{t(`visibility.${value}`)}</span>
            <span className="text-xs text-muted-foreground">{t(`visibilityHint.${value}`)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button type="button" onClick={() => onOpenChange(true)} className="font-semibold">
        <Plus aria-hidden />
        {t("declare")}
      </Button>

      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("declareTitle")}</DialogTitle>
          <DialogDescription>{t("declareDescription")}</DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
          {step.kind === "search" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="result-tournament">{t("tournament")}</Label>
                <div className="flex flex-wrap gap-2">
                  <div className="relative min-w-[200px] flex-1">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="result-tournament"
                      type="search"
                      autoFocus
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t("tournamentPlaceholder")}
                      maxLength={80}
                      className="pl-9"
                    />
                  </div>
                  {Object.keys(gameNames).length > 1 && (
                    <Select value={gameId} onValueChange={setGameId}>
                      <SelectTrigger className="w-auto min-w-[130px]" aria-label={t("game")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(gameNames).map(([id, label]) => (
                          <SelectItem key={id} value={id}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t("tournamentHint")}</p>
              </div>

              {searching && !found && query.trim().length >= 2 && <div className="h-16 animate-pulse rounded-[10px] border bg-card/60" aria-hidden />}

              {found && query.trim().length >= 2 && (
                <ul className="flex flex-col gap-2" aria-busy={searching}>
                  {found.locator.map((event) => (
                    <li key={event.id} className="flex flex-col gap-2 rounded-[10px] border p-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold">{event.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {t("sourceLocator")} · {formatDate(event.date)} · {t("players", { count: event.playerCount })}
                        </span>
                      </div>
                      {(playerSearch?.eventId === event.id ? playerSearch.players : event.suggestions).map((player) => (
                        <PlayerLine
                          key={player.registrationId}
                          player={player}
                          onClaim={() => {
                            setStep({ kind: "claim", event, player });
                            setGameId(event.gameId);
                            setDeckId(NONE);
                          }}
                          t={t}
                        />
                      ))}
                      {playerSearch?.eventId === event.id ? (
                        <Input
                          type="search"
                          value={playerSearch.query}
                          onChange={(changeEvent) => searchPlayers(event.id, changeEvent.target.value)}
                          placeholder={t("playerSearchPlaceholder")}
                          aria-label={t("playerSearchPlaceholder")}
                          className="h-8 text-[13px]"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => searchPlayers(event.id, "")}
                          className="self-start text-xs font-medium text-primary hover:underline"
                        >
                          {event.suggestions.length > 0 ? t("notMe") : t("findMe")}
                        </button>
                      )}
                    </li>
                  ))}

                  {found.joutes.map((tournament) => (
                    <li key={tournament.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border p-3">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold">{tournament.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {[t("sourceJoutes"), formatDate(tournament.date), tournament.place].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      {tournament.mine ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Check className="size-3.5" aria-hidden />
                          {t("alreadyMine")}
                        </span>
                      ) : (
                        <Button type="button" size="sm" variant="outline" onClick={() => setStep({ kind: "form", joutes: tournament })}>
                          {t("pick")}
                        </Button>
                      )}
                    </li>
                  ))}

                  {found.joutes.length === 0 && found.locator.length === 0 && (
                    <li className="text-sm text-muted-foreground">{t("noTournamentFound")}</li>
                  )}
                </ul>
              )}

              <button
                type="button"
                onClick={() => {
                  setName(query.trim());
                  setStep({ kind: "form" });
                }}
                className="self-start text-sm font-medium text-primary hover:underline"
              >
                {t("manualEntry")}
              </button>
            </>
          )}

          {step.kind !== "search" && (
            <button
              type="button"
              onClick={() => setStep({ kind: "search" })}
              className="inline-flex items-center gap-1.5 self-start text-[13px] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              {t("backToSearch")}
            </button>
          )}

          {step.kind === "claim" && (
            <>
              <div className="flex flex-col gap-1 rounded-[10px] border bg-card/60 p-3 text-sm">
                <span className="font-semibold">{step.event.name}</span>
                <span className="text-muted-foreground">
                  {t("claimSummary", { name: step.player.name, details: playerDetails(step.player, t) })}
                </span>
              </div>
              {deckField}
              {visibilityField}
            </>
          )}

          {step.kind === "form" && (
            <>
              {step.joutes ? (
                <div className="flex flex-col gap-0.5 rounded-[10px] border bg-card/60 p-3 text-sm">
                  <span className="font-semibold">{step.joutes.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[t("sourceJoutes"), formatDate(step.joutes.date), step.joutes.place].filter(Boolean).join(" · ")}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="result-name">{t("tournamentName")}</Label>
                    <Input id="result-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
                      <Label htmlFor="result-date">{t("date")}</Label>
                      <Input id="result-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                    </div>
                    <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
                      <Label htmlFor="result-place">{t("place")}</Label>
                      <Input id="result-place" value={place} onChange={(event) => setPlace(event.target.value)} maxLength={120} />
                    </div>
                  </div>
                </>
              )}

              <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="result-placement" className="leading-5">
                    {t("placementLabel")}
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id="result-placement"
                      inputMode="numeric"
                      value={placement}
                      onChange={(event) => setPlacement(event.target.value.replace(/\D/g, ""))}
                      className="w-16"
                    />
                    <span className="text-sm text-muted-foreground">/</span>
                    <Input
                      inputMode="numeric"
                      value={playerCount}
                      onChange={(event) => setPlayerCount(event.target.value.replace(/\D/g, ""))}
                      aria-label={t("playerCount")}
                      placeholder={t("playerCountShort")}
                      className="w-20"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm leading-5 font-medium" id="result-record">
                    {t("record")}
                  </span>
                  <div className="flex items-center gap-1" role="group" aria-labelledby="result-record">
                    {[
                      [wins, setWins, t("wins")],
                      [losses, setLosses, t("losses")],
                      [draws, setDraws, t("draws")],
                    ].map(([value, set, label], index) => (
                      <span key={index} className="flex items-center gap-1">
                        {index > 0 && <span className="text-muted-foreground">-</span>}
                        <Input
                          inputMode="numeric"
                          value={value as string}
                          onChange={(event) => (set as (next: string) => void)(event.target.value.replace(/\D/g, ""))}
                          aria-label={label as string}
                          placeholder={(label as string).slice(0, 1)}
                          className="w-12 text-center"
                        />
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium" id="result-top-cut">
                  {t("finalPhase")}
                </span>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="result-top-cut">
                  {TOP_CUTS.map((size) => (
                    <button
                      key={size}
                      type="button"
                      role="radio"
                      aria-checked={topCut === size}
                      onClick={() => setTopCut(size)}
                      className={cn(
                        "h-8 rounded-full border px-3 text-[13px]",
                        topCut === size
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:bg-accent",
                      )}
                    >
                      {size === 0 ? t("noFinalPhase") : t("topCut", { size })}
                    </button>
                  ))}
                </div>
              </div>

              {deckField}
              {deckId === NONE && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="result-legend">{t("legendLabel")}</Label>
                  <Input
                    id="result-legend"
                    value={legendName}
                    onChange={(event) => setLegendName(event.target.value)}
                    maxLength={120}
                  />
                </div>
              )}
              {visibilityField}
            </>
          )}
        </div>

        {step.kind !== "search" && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={submit} disabled={saving || (step.kind === "form" && !step.joutes && !name.trim())}>
              {t("save")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Translate = ReturnType<typeof useTranslations<"PlayGroups.hub.tournaments">>;

/** « 37e avec Kai'Sa, 6-2-1 » : ce que le locator sait du joueur. */
function playerDetails(player: LocatorPlayerSuggestion, t: Translate): string {
  const head = [
    player.place ? t("placement", { place: player.place }) : t("unrankedShort"),
    player.legend ? t("withLegend", { legend: player.legend }) : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return player.record ? `${head}, ${player.record}` : head;
}

function PlayerLine({
  player,
  onClaim,
  t,
}: {
  player: LocatorPlayerSuggestion;
  onClaim: () => void;
  t: Translate;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/10 px-2.5 py-2">
      <UserRound className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 text-[13px]">
        {t("suggestion", { name: player.name, details: playerDetails(player, t) })}
      </span>
      {player.claimedBy === "me" ? (
        <span className="text-xs text-muted-foreground">{t("alreadyMine")}</span>
      ) : player.claimedBy === "other" ? (
        <span className="text-xs text-muted-foreground">{t("claimedByOther")}</span>
      ) : (
        <Button type="button" size="sm" onClick={onClaim}>
          {t("itsMe")}
        </Button>
      )}
    </div>
  );
}
