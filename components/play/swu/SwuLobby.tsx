"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bot, Eye, Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  createSwuTableAction,
  loadSwuLobby,
  searchSwuPlayDecksAction,
  type SwuLobby as Lobby,
  type SwuLobbyDeck,
} from "@/app/[locale]/(app)/games/swu/play/actions";
import { DeckPicker } from "@/components/play/DeckPicker";
import { withDeckProblems } from "@/components/play/deck-problems";
import { readSwuSave, writeSwuSave, type SwuSave } from "@/components/play/swu/useSwuSoloGame";
import { useSwuTableCards } from "@/components/play/swu/useSwuTableCards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { loadSwuEngine } from "@/lib/engine/swu/browser";
import { ASPECT_HEX, swuPickerCards } from "@/lib/engine/swu/cards";
import type { SwuDeckList } from "@/lib/engine/swu/types";
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

type Opponent = "ai" | "watch" | "online";

const searchDecks = (query: string) =>
  searchSwuPlayDecksAction(query).then((result) => (result.ok ? result.decks : []));

/** La page Jouer de Star Wars: Unlimited : choisir les decks et le niveau de l'IA, ou reprendre une partie. */
export function SwuLobby() {
  const t = useTranslations("Games.Play");
  const ts = useTranslations("Games.PlaySwu");
  const router = useRouter();
  const cards = useSwuTableCards();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [failed, setFailed] = useState(false);
  const [opponent, setOpponent] = useState<Opponent>("ai");
  const [code, setCode] = useState("");
  const [choice, setChoice] = useState<DeckChoice | null>(null);
  const [botDecks, setBotDecks] = useState<BotDeckChoice[]>([]);
  const [botLevels, setBotLevels] = useState<BotLevel[]>([]);
  const [found, setFound] = useState<Record<string, SwuLobbyDeck>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SwuSave | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSwuLobby().then((result) => {
      if (cancelled) return;
      if (result.ok) setLobby(result.lobby);
      else setFailed(true);
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- le stockage n'existe que dans le navigateur
    setSaved(readSwuSave());
    return () => {
      cancelled = true;
    };
  }, []);

  // Ce que la liste des decks lit d'un leader : nom, vignette, aspects.
  const pickerCards = useMemo(() => swuPickerCards(cards), [cards]);
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
  const listOf = async (picked: BotDeckChoice | null): Promise<SwuDeckList | null> => {
    if (!picked) return null;
    if (picked.kind === "deck") return deckById(picked.deckId)?.list ?? null;
    const engine = await loadSwuEngine();
    const leader = picked.kind === "auto" ? picked.legend : pickRandom(lobby.leaders);
    // La base : une de celles qui partagent un aspect avec le leader, pour un deck sans pénalité.
    const aspects = cards[leader]?.aspects ?? [];
    const fitting = lobby.bases.filter((base) => cards[base]?.aspects.some((aspect) => aspects.includes(aspect)));
    const base = pickRandom(fitting.length > 0 ? fitting : lobby.bases);
    return JSON.parse(engine.swu_auto_deck(leader, base, randomSeed())) as SwuDeckList | null;
  };

  const start = async () => {
    setBusy(true);
    try {
      const engine = await loadSwuEngine();
      const players: { name: string; deck: SwuDeckList }[] = [];
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
      const save: SwuSave = {
        seat: watching ? null : 0,
        bots,
        record: { config: { players }, seed: randomSeed(), actions: [] },
      };
      // Le moteur refuse ici une configuration qu'il ne sait pas jouer, avant de quitter la page.
      const table = new engine.SwuTable(JSON.stringify(save.record.config), save.record.seed, JSON.stringify(bots));
      save.record = JSON.parse(table.record()) as SwuSave["record"];
      table.free();
      writeSwuSave(save);
      router.push("/games/swu/play/solo");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  };

  const createOnline = async () => {
    setBusy(true);
    const result = await createSwuTableAction(choice);
    if (result.ok) {
      router.push(`/games/swu/play/table?id=${result.id}`);
      return;
    }
    setBusy(false);
    toast.error(withDeckProblems(t, t(`error.${result.error}`), result.details));
  };

  const joinCode = code.trim().toLowerCase().split("id=").pop() ?? "";

  const modes: { key: Opponent; icon: typeof Bot; title: string; hint: string }[] = [
    { key: "ai", icon: Bot, title: t("lobby.ai"), hint: t("lobby.aiHint") },
    { key: "watch", icon: Eye, title: t("lobby.watch"), hint: t("lobby.watchHint") },
    { key: "online", icon: Globe, title: t("lobby.online"), hint: t("lobby.onlineHint") },
  ];
  const texts = { auto: ts("lobby.deckAuto"), randomHint: ts("lobby.deckRandomHint"), search: ts("lobby.deckSearch") };

  const picker = (seat: number, name: string, bot: boolean) => (
    <DeckPicker<SwuLobbyDeck>
      id={`swu-deck-${seat}`}
      srLabel={t("deck.of", { name })}
      decks={lobby.decks}
      legends={lobby.leaders}
      cards={pickerCards}
      colors={ASPECT_HEX}
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
                {ts("lobby.resumeHint", {
                  players: saved.record.config.players.map((player) => player.name).join(" · "),
                  moves: saved.record.actions.length,
                })}
              </p>
            </div>
            <div className="flex flex-row flex-wrap gap-2">
              <Button asChild>
                <Link href="/games/swu/play/solo">{t("lobby.resume")}</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  writeSwuSave(null);
                  setSaved(null);
                }}
              >
                {t("lobby.discard")}
              </Button>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">{ts("lobby.whoTitle")}</h2>
          <div className="grid gap-2 sm:grid-cols-3">
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
            {(opponent === "online" ? [] : [0, 1])
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

          {!lobby.signedIn && opponent !== "online" && (
            <div className="flex flex-row flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{t("lobby.signInForDecks")}</span>
              <Button asChild size="sm" variant="outline">
                <Link href="/login">{t("lobby.signIn")}</Link>
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{ts("lobby.sets")}</p>

          {opponent !== "online" && (
            <div className="flex flex-col gap-2">
              {watching && <p className="text-sm text-muted-foreground">{ts("lobby.watchInfo")}</p>}
              <div className="flex flex-row flex-wrap gap-2">
                <Button disabled={busy || (!watching && !choice)} onClick={start}>
                  {watching ? t("lobby.startWatch") : t("lobby.startSolo")}
                </Button>
              </div>
              {saved && <p className="text-xs text-muted-foreground">{t("lobby.replaces")}</p>}
            </div>
          )}

          {opponent === "online" &&
            (!lobby.online ? (
              <p className="text-sm text-muted-foreground">{t("lobby.offline")}</p>
            ) : !lobby.signedIn ? (
              <div className="flex flex-row flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{t("lobby.signInForOnline")}</span>
                <Button asChild size="sm">
                  <Link href="/login">{t("lobby.signIn")}</Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-row flex-wrap gap-2">
                  <Button disabled={busy || !choice} onClick={createOnline}>
                    {t("lobby.createTable")}
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="swu-join-code">{t("lobby.joinLabel")}</Label>
                  <div className="flex flex-row flex-wrap gap-2">
                    <Input
                      id="swu-join-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder={t("lobby.joinPlaceholder")}
                      className="max-w-xs"
                    />
                    <Button
                      variant="outline"
                      disabled={!/^[a-z0-9]{4,32}$/.test(joinCode)}
                      onClick={() => router.push(`/games/swu/play/table?id=${joinCode}`)}
                    >
                      {t("lobby.join")}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        {lobby.online && lobby.signedIn && (
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <h2 className="font-semibold">{t("lobby.tablesTitle")}</h2>
            {lobby.tables.length === 0 && <p className="text-sm text-muted-foreground">{t("lobby.noTables")}</p>}
            <ul className="flex flex-col gap-2">
              {lobby.tables.map((table) => (
                <li key={table.id}>
                  <Link
                    href={`/games/swu/play/table?id=${table.id}`}
                    className="flex flex-col gap-1 rounded-lg border p-3 transition hover:border-primary/60"
                  >
                    <span className="flex flex-row flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{table.seats.map((seat) => seat.name).join(" · ")}</span>
                      <Badge variant={table.status === "finished" ? "outline" : "secondary"}>
                        {t(`tableStatus.${table.status}`)}
                      </Badge>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {table.seats.map((seat) => cards[seat.legend]?.name ?? seat.deckName).filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="flex flex-col gap-2 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          <h2 className="font-semibold text-foreground">{t("lobby.aboutTitle")}</h2>
          <p>{ts("lobby.about")}</p>
          <p>{ts("lobby.soon")}</p>
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
