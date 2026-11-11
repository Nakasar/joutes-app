"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bot, Eye, FlaskConical, Globe, Server } from "lucide-react";
import { useTranslations } from "next-intl";

import { withDeckProblems } from "@/components/play/deck-problems";
import { toast } from "sonner";

import {
  createTableAction,
  loadLobby,
  type Lobby,
  type LobbyDeck,
} from "@/app/[locale]/(app)/games/riftbound/play/actions";
import { DeckPicker } from "@/components/play/DeckPicker";
import { HostPanel } from "@/components/play/HostPanel";
import { readSoloSave, writeSoloSave, type SoloSave } from "@/components/play/useSoloGame";
import { useTableCards } from "@/components/play/useTableCards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { loadEngine } from "@/lib/engine/browser";
import type { BotDeckChoice, DeckChoice } from "@/lib/engine/tables";
import {
  BOT_LEVELS,
  ENGINE_MODES,
  modePlayers,
  type BotLevel,
  type EngineDeckList,
  type EngineMode,
} from "@/lib/engine/types";
import { cn } from "@/lib/utils";

/** Qui joue : moi contre l'IA, des IA entre elles (je regarde), en ligne, ou sur un serveur. */
type Opponent = "ai" | "watch" | "online" | "host";

/** Couleurs des sièges, dans l'ordre de la table (comme `playerColor`). */
const SEAT_COLORS = ["#2bb7dc", "#f05a7e", "#f5b041", "#8e7cf0"];

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31) + 1;
}

export function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** La page Jouer : choisir un mode, un deck et un adversaire, ou reprendre une table. */
export function PlayLobby() {
  const t = useTranslations("Games.Play");
  const router = useRouter();
  const cards = useTableCards();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<EngineMode>("duel");
  const [choice, setChoice] = useState<DeckChoice | null>(null);
  const [opponent, setOpponent] = useState<Opponent>("ai");
  // Par siège : le deck et le niveau de l'IA qui s'y assoit.
  const [botDecks, setBotDecks] = useState<BotDeckChoice[]>([]);
  const [botLevels, setBotLevels] = useState<BotLevel[]>([]);
  // Les decks publics trouvés par une recherche, absents de `lobby.decks`.
  const [found, setFound] = useState<Record<string, LobbyDeck>>({});
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SoloSave | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadLobby().then((result) => {
      if (cancelled) return;
      if (result.ok) setLobby(result.lobby);
      else setFailed(true);
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- le stockage n'existe que dans le navigateur
    setSaved(readSoloSave());
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{t("error.SERVER")}</p>;
  }
  if (!lobby) {
    return <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{t("status.loading")}</p>;
  }

  const watching = opponent === "watch";
  const seatCount = modePlayers(mode);
  const botDeckOf = (seat: number): BotDeckChoice => botDecks[seat] ?? { kind: "random" };
  const botLevelOf = (seat: number): BotLevel => botLevels[seat] ?? "normal";
  const deckById = (id: string) => lobby.decks.find((deck) => deck.id === id) ?? found[id];

  /** La liste d'un deck choisi, telle que le moteur la veut. */
  const listOf = async (picked: BotDeckChoice | null): Promise<EngineDeckList | null> => {
    if (!picked) return null;
    if (picked.kind === "deck") return deckById(picked.deckId)?.list ?? null;
    const engine = await loadEngine();
    const legend = picked.kind === "auto" ? picked.legend : pickRandom(lobby.legends);
    return JSON.parse(engine.auto_deck(legend, randomSeed())) as EngineDeckList | null;
  };
  const myDeck = () => listOf(choice);

  const startSolo = async () => {
    setBusy(true);
    try {
      const engine = await loadEngine();
      const players: { name: string; deck: EngineDeckList }[] = [];
      const bots: (BotLevel | null)[] = [];
      if (!watching) {
        const deck = await myDeck();
        if (!deck) throw new Error(t("error.INVALID_DECK"));
        players.push({ name: lobby.name ?? t("lobby.you"), deck });
        bots.push(null);
      }
      for (let seat = players.length; seat < seatCount; seat++) {
        const bot = await listOf(botDeckOf(seat));
        if (!bot) throw new Error(t("error.INVALID_DECK"));
        players.push({ name: t("lobby.botName", { number: watching ? seat + 1 : seat }), deck: bot });
        bots.push(botLevelOf(seat));
      }
      const save: SoloSave = {
        seat: watching ? null : 0,
        bots,
        record: { config: { mode, players }, seed: randomSeed(), actions: [] },
      };
      // Le moteur refuse ici une configuration qu'il ne sait pas jouer, avant
      // qu'on ne quitte la page.
      engine.Table.restore(JSON.stringify(save.record), JSON.stringify(bots)).free();
      writeSoloSave(save);
      router.push("/games/riftbound/play/solo");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  };

  const createOnline = async () => {
    setBusy(true);
    const result = await createTableAction(mode, choice);
    if (result.ok) {
      router.push(`/games/riftbound/play/table?id=${result.id}`);
      return;
    }
    setBusy(false);
    toast.error(withDeckProblems(t, t(`error.${result.error}`), result.details));
  };

  const joinCode = code.trim().toLowerCase().split("id=").pop() ?? "";

  const opponents: { key: Opponent; icon: typeof Bot; title: string; hint: string }[] = [
    { key: "ai", icon: Bot, title: t("lobby.ai"), hint: t("lobby.aiHint") },
    { key: "watch", icon: Eye, title: t("lobby.watch"), hint: t("lobby.watchHint") },
    { key: "online", icon: Globe, title: t("lobby.online"), hint: t("lobby.onlineHint") },
    { key: "host", icon: Server, title: t("lobby.host"), hint: t("lobby.hostHint") },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="flex flex-col gap-4">
        {saved && (
          <section className="flex flex-row flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/50 bg-card p-5">
            <div>
              <h2 className="font-semibold">{t(saved.seat === null ? "lobby.resumeWatchTitle" : "lobby.resumeTitle")}</h2>
              <p className="text-sm text-muted-foreground">
                {t(saved.seat === null ? "lobby.resumeWatchHint" : "lobby.resumeHint", {
                  mode: t(`mode.${saved.record.config.mode}`),
                  moves: saved.record.actions.length,
                })}
              </p>
            </div>
            <div className="flex flex-row flex-wrap gap-2">
              <Button asChild>
                <Link href="/games/riftbound/play/solo">{t("lobby.resume")}</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  writeSoloSave(null);
                  setSaved(null);
                }}
              >
                {t("lobby.discard")}
              </Button>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">{t("lobby.modeTitle")}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ENGINE_MODES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-3 text-left transition hover:border-primary/60",
                  mode === value && "border-primary bg-primary/10",
                )}
              >
                <span className="font-medium">{t(`mode.${value}`)}</span>
                <span className="text-xs text-muted-foreground">{t(`modeHint.${value}`)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">{t("lobby.whoTitle")}</h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {opponents.map(({ key, icon: Icon, title, hint }) => (
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
                <DeckPicker
                  id="lobby-deck"
                  srLabel={t("deck.of", { name: lobby.name ?? t("lobby.you") })}
                  decks={lobby.decks}
                  legends={lobby.legends}
                  cards={cards}
                  value={choice}
                  onChange={(next, deck) => {
                    if (next.kind === "random") return;
                    if (deck) setFound((previous) => ({ ...previous, [deck.id]: deck }));
                    setChoice(next);
                  }}
                  className="flex-1 basis-72"
                />
              </SeatRow>
            )}
            {(opponent === "ai" || watching) &&
              Array.from({ length: seatCount }, (_, seat) => seat)
                .filter((seat) => watching || seat > 0)
                .map((seat) => {
                  const name = t("lobby.botName", { number: watching ? seat + 1 : seat });
                  return (
                    <SeatRow key={seat} color={SEAT_COLORS[seat]} name={name}>
                      <DeckPicker
                        id={`bot-deck-${seat}`}
                        srLabel={t("deck.of", { name })}
                        decks={lobby.decks}
                        legends={lobby.legends}
                        cards={cards}
                        value={botDeckOf(seat)}
                        allowRandom
                        onChange={(next, deck) => {
                          if (deck) setFound((previous) => ({ ...previous, [deck.id]: deck }));
                          setBotDecks((previous) => {
                            const copy = [...previous];
                            copy[seat] = next;
                            return copy;
                          });
                        }}
                        className="flex-1 basis-72"
                      />
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
          <p className="text-xs text-muted-foreground">{t("lobby.sets")}</p>

          {(opponent === "ai" || watching) && (
            <div className="flex flex-col gap-2">
              {watching && <p className="text-sm text-muted-foreground">{t("lobby.watchInfo")}</p>}
              <div className="flex flex-row flex-wrap gap-2">
                <Button disabled={busy || (!watching && !choice)} onClick={startSolo}>
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
                  <Label htmlFor="join-code">{t("lobby.joinLabel")}</Label>
                  <div className="flex flex-row flex-wrap gap-2">
                    <Input
                      id="join-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder={t("lobby.joinPlaceholder")}
                      className="max-w-xs"
                    />
                    <Button
                      variant="outline"
                      disabled={!/^[a-z0-9]{4,32}$/.test(joinCode)}
                      onClick={() => router.push(`/games/riftbound/play/table?id=${joinCode}`)}
                    >
                      {t("lobby.join")}
                    </Button>
                  </div>
                </div>
              </div>
            ))}

          {opponent === "host" && (
            <HostPanel mode={mode} hostName={lobby.name ?? t("lobby.you")} hostDeck={myDeck} legends={lobby.legends} />
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">{t("lobby.tablesTitle")}</h2>
          {lobby.tables.length === 0 && <p className="text-sm text-muted-foreground">{t("lobby.noTables")}</p>}
          <ul className="flex flex-col gap-2">
            {lobby.tables.map((table) => (
              <li key={table.id}>
                <Link
                  href={`/games/riftbound/play/table?id=${table.id}`}
                  className="flex flex-col gap-1 rounded-lg border p-3 transition hover:border-primary/60"
                >
                  <span className="flex flex-row flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{t(`mode.${table.mode}`)}</span>
                    <Badge variant={table.status === "finished" ? "outline" : "secondary"}>
                      {t(`tableStatus.${table.status}`)}
                    </Badge>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {table.seats.map((seat) => seat.name).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <FlaskConical className="size-4" aria-hidden />
            {t("sim.lobbyTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("sim.lobbyHint")}</p>
          <Button asChild variant="outline" size="sm" className="self-start">
            <Link href="/games/riftbound/play/simulate">{t("sim.lobbyOpen")}</Link>
          </Button>
        </section>

        <section className="flex flex-col gap-2 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          <h2 className="font-semibold text-foreground">{t("lobby.aboutTitle")}</h2>
          <p>{t("lobby.about")}</p>
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
