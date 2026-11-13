"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bot, Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  loadCpLobby,
  searchCpPlayDecksAction,
  type CpLobby as Lobby,
  type CpLobbyDeck,
} from "@/app/[locale]/(app)/games/cp/play/actions";
import { DeckPicker } from "@/components/play/DeckPicker";
import { readCpSave, writeCpSave, type CpSave } from "@/components/play/cyberpunk/useCpSoloGame";
import { useCpTableCards } from "@/components/play/cyberpunk/useCpTableCards";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { loadCpEngine } from "@/lib/engine/cyberpunk/browser";
import { autoLegends, COLOR_HEX, cpPickerCards, type LegendInfo } from "@/lib/engine/cyberpunk/cards";
import type { CpDeckList, CpEngineCard } from "@/lib/engine/cyberpunk/types";
import type { BotDeckChoice, DeckChoice } from "@/lib/engine/tables";
import { BOT_LEVELS, type BotLevel } from "@/lib/engine/types";
import { cn } from "@/lib/utils";

const SEAT_COLORS = ["#2bb7dc", "#e0566b"];

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31) + 1;
}

function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

type Opponent = "ai" | "watch";

const searchDecks = (query: string) =>
  searchCpPlayDecksAction(query).then((result) => (result.ok ? result.decks : []));

/** La page Jouer de Cyberpunk TCG : choisir les decks et le niveau de l'IA, ou reprendre une partie. */
export function CpLobby() {
  const t = useTranslations("Games.Play");
  const tc = useTranslations("Games.PlayCp");
  const router = useRouter();
  const cards = useCpTableCards();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [failed, setFailed] = useState(false);
  const [opponent, setOpponent] = useState<Opponent>("ai");
  const [choice, setChoice] = useState<DeckChoice | null>(null);
  const [botDecks, setBotDecks] = useState<BotDeckChoice[]>([]);
  const [botLevels, setBotLevels] = useState<BotLevel[]>([]);
  const [found, setFound] = useState<Record<string, CpLobbyDeck>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<CpSave | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCpLobby().then((result) => {
      if (cancelled) return;
      if (result.ok) setLobby(result.lobby);
      else setFailed(true);
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- le stockage n'existe que dans le navigateur
    setSaved(readCpSave());
    return () => {
      cancelled = true;
    };
  }, []);

  // Ce que la liste des decks lit d'une Légende : nom, vignette, couleur.
  const pickerCards = useMemo(() => cpPickerCards(cards), [cards]);
  const watching = opponent === "watch";

  if (failed) {
    return <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{t("error.SERVER")}</p>;
  }
  if (!lobby) {
    return <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{t("status.loading")}</p>;
  }

  const botDeckOf = (seat: number): BotDeckChoice => botDecks[seat] ?? { kind: "random" };
  const botLevelOf = (seat: number): BotLevel => botLevels[seat] ?? "normal";
  const deckById = (id: string) => lobby.decks.find((deck) => deck.id === id) ?? found[id];

  /** La liste d'un deck choisi, telle que le moteur la veut. */
  const listOf = async (picked: BotDeckChoice | null): Promise<CpDeckList | null> => {
    if (!picked) return null;
    if (picked.kind === "deck") return deckById(picked.deckId)?.list ?? null;
    const engine = await loadCpEngine();
    // Les Légendes jouables, lues dans le moteur : les cartes de la table peuvent ne pas être arrivées.
    const playable = new Set(lobby.legends);
    const legends: LegendInfo[] = (JSON.parse(engine.cp_catalog()) as CpEngineCard[])
      .filter((card) => card.kind === "legend" && playable.has(card.code))
      .map((card) => ({ code: card.code, title: card.name, color: card.color }));
    const first = picked.kind === "auto" ? picked.legend : pickRandom(lobby.legends);
    const trio = autoLegends(first, legends, pickRandom);
    if (!trio) return null;
    return JSON.parse(engine.cp_auto_deck(JSON.stringify(trio), randomSeed())) as CpDeckList | null;
  };

  const start = async () => {
    setBusy(true);
    try {
      const engine = await loadCpEngine();
      const players: { name: string; deck: CpDeckList }[] = [];
      const bots: (BotLevel | null)[] = [];
      if (!watching) {
        const deck = await listOf(choice);
        if (!deck) throw new Error(t("error.INVALID_DECK"));
        players.push({ name: lobby.name ?? t("lobby.you"), deck });
        bots.push(null);
      }
      for (let seat = players.length; seat < 2; seat++) {
        const deck = await listOf(botDeckOf(seat));
        if (!deck) throw new Error(t("error.INVALID_DECK"));
        players.push({ name: t("lobby.botName", { number: watching ? seat + 1 : seat }), deck });
        bots.push(botLevelOf(seat));
      }
      const save: CpSave = {
        seat: watching ? null : 0,
        bots,
        record: { config: { players }, seed: randomSeed(), actions: [] },
      };
      // Le moteur refuse ici une configuration qu'il ne sait pas jouer, avant de quitter la page.
      const table = new engine.CyberpunkTable(JSON.stringify(save.record.config), save.record.seed, JSON.stringify(bots));
      save.record = JSON.parse(table.record()) as CpSave["record"];
      table.free();
      writeCpSave(save);
      router.push("/games/cp/play/solo");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  };

  const modes: { key: Opponent; icon: typeof Bot; title: string; hint: string }[] = [
    { key: "ai", icon: Bot, title: t("lobby.ai"), hint: t("lobby.aiHint") },
    { key: "watch", icon: Eye, title: t("lobby.watch"), hint: t("lobby.watchHint") },
  ];
  const texts = { auto: tc("lobby.deckAuto"), randomHint: tc("lobby.deckRandomHint"), search: tc("lobby.deckSearch") };

  const picker = (seat: number, name: string, bot: boolean) => (
    <DeckPicker<CpLobbyDeck>
      id={`cp-deck-${seat}`}
      srLabel={t("deck.of", { name })}
      decks={lobby.decks}
      legends={lobby.legends}
      cards={pickerCards}
      colors={COLOR_HEX}
      texts={texts}
      search={searchDecks}
      value={bot ? botDeckOf(seat) : choice}
      allowRandom={bot}
      onChange={(next, deck) => {
        if (deck) setFound((previous) => ({ ...previous, [deck.id]: deck }));
        if (!bot) {
          if (next.kind !== "random") setChoice(next);
          return;
        }
        setBotDecks((previous) => {
          const copy = [...previous];
          copy[seat] = next;
          return copy;
        });
      }}
      className="flex-1 basis-72"
    />
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="flex flex-col gap-4">
        {saved && (
          <section className="flex flex-row flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/50 bg-card p-5">
            <div>
              <h2 className="font-semibold">{t(saved.seat === null ? "lobby.resumeWatchTitle" : "lobby.resumeTitle")}</h2>
              <p className="text-sm text-muted-foreground">
                {tc("lobby.resumeHint", {
                  players: saved.record.config.players.map((player) => player.name).join(" · "),
                  moves: saved.record.actions.length,
                })}
              </p>
            </div>
            <div className="flex flex-row flex-wrap gap-2">
              <Button asChild>
                <Link href="/games/cp/play/solo">{t("lobby.resume")}</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  writeCpSave(null);
                  setSaved(null);
                }}
              >
                {t("lobby.discard")}
              </Button>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">{tc("lobby.whoTitle")}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {modes.map(({ key, icon: Icon, title, hint }) => (
              <button
                key={key}
                type="button"
                aria-pressed={opponent === key}
                onClick={() => setOpponent(key)}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-3 text-left transition hover:border-primary/60",
                  opponent === key && "border-primary bg-primary/10",
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <Icon className="size-4" aria-hidden />
                  {title}
                </span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>

          <ul className="flex flex-col">
            {!watching && (
              <SeatRow color={SEAT_COLORS[0]} name={lobby.name ?? t("lobby.you")} you={t("lobby.youBadge")}>
                {picker(0, lobby.name ?? t("lobby.you"), false)}
              </SeatRow>
            )}
            {[0, 1]
              .filter((seat) => watching || seat > 0)
              .map((seat) => {
                const name = t("lobby.botName", { number: watching ? seat + 1 : seat });
                return (
                  <SeatRow key={seat} color={SEAT_COLORS[seat]} name={name}>
                    {picker(seat, name, true)}
                    <div
                      className="inline-flex overflow-hidden rounded-lg border"
                      role="group"
                      aria-label={t("lobby.levelOf", { name })}
                    >
                      {BOT_LEVELS.map((value) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={botLevelOf(seat) === value}
                          onClick={() =>
                            setBotLevels((previous) => {
                              const copy = [...previous];
                              copy[seat] = value;
                              return copy;
                            })
                          }
                          className={cn(
                            "min-h-9 px-3 text-xs transition",
                            botLevelOf(seat) === value
                              ? "bg-secondary text-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {t(`level.${value}`)}
                        </button>
                      ))}
                    </div>
                  </SeatRow>
                );
              })}
          </ul>

          {!lobby.signedIn && (
            <div className="flex flex-row flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{t("lobby.signInForDecks")}</span>
              <Button asChild size="sm" variant="outline">
                <Link href="/login">{t("lobby.signIn")}</Link>
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{tc("lobby.sets")}</p>

          <div className="flex flex-col gap-2">
            {watching && <p className="text-sm text-muted-foreground">{tc("lobby.watchInfo")}</p>}
            <div className="flex flex-row flex-wrap gap-2">
              <Button disabled={busy || (!watching && !choice)} onClick={start}>
                {watching ? t("lobby.startWatch") : t("lobby.startSolo")}
              </Button>
            </div>
            {saved && <p className="text-xs text-muted-foreground">{t("lobby.replaces")}</p>}
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <section className="flex flex-col gap-2 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          <h2 className="font-semibold text-foreground">{t("lobby.aboutTitle")}</h2>
          <p>{tc("lobby.about")}</p>
          <p>{tc("lobby.legends")}</p>
        </section>
      </aside>
    </div>
  );
}

/** Une ligne de « Qui joue ? » : un siège, son deck et, pour une IA, son niveau. */
function SeatRow({ color, name, you, children }: { color: string; name: string; you?: string; children: ReactNode }) {
  return (
    <li className="flex flex-row flex-wrap items-center gap-3 border-t py-3 first:border-t-0">
      <span className="flex w-32 shrink-0 items-center gap-2">
        <span aria-hidden className="size-2.5 rounded-full" style={{ background: color }} />
        <span className="truncate font-semibold">{name}</span>
        {you && <span className="rounded-md bg-secondary px-1.5 text-[0.7rem]">{you}</span>}
      </span>
      {children}
    </li>
  );
}
