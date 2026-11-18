"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { GameTable } from "@/components/play/GameTable";
import { BuildScreen } from "@/components/play/limited/BuildScreen";
import { DraftScreen } from "@/components/play/limited/DraftScreen";
import { EventHeader, SeatStrip, type EventStep } from "@/components/play/limited/limited-kit";
import { LimitedResults } from "@/components/play/limited/LimitedResults";
import { SealedOpening } from "@/components/play/limited/SealedOpening";
import { useLimitedEvent, type LimitedFeed } from "@/components/play/limited/useLimitedEvent";
import { useSoloGame, type SoloSave } from "@/components/play/useSoloGame";
import { useTableCards } from "@/components/play/useTableCards";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import type { TableCards } from "@/lib/engine/cards";
import {
  emptyDeck,
  fitToPool,
  matchOf,
  matchWinner,
  readLimitedSave,
  writeLimitedSave,
  type LimitedMatch,
  type LimitedSave,
  type LimitedView,
} from "@/lib/engine/limited";
import type { EngineDeckList } from "@/lib/engine/types";

const LOBBY = "/games/riftbound/play";

/**
 * Un scellé ou un draft contre des IA, du premier booster au match : ouvrir
 * (ou drafter), construire, puis jouer un match sur la table. Tout se passe
 * dans le navigateur ; l'évènement est gardé dans `localStorage` et reprend au
 * rechargement.
 */
export function LimitedGame() {
  const t = useTranslations("Games.Limited");
  const tPlay = useTranslations("Games.Play");
  const router = useRouter();
  const cards = useTableCards();
  // `undefined` : pas encore lu (le stockage n'existe que dans le navigateur).
  const [save, setSave] = useState<LimitedSave | null | undefined>(undefined);
  const latest = useRef<LimitedSave | null>(null);
  // Le match vient de finir sous nos yeux : on reste à la table jusqu'à ce que le joueur la quitte.
  const [atTable, setAtTable] = useState(false);
  const [summary, setSummary] = useState(false);

  useEffect(() => {
    const read = readLimitedSave();
    latest.current = read;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture du stockage après le montage, pour ne pas diverger du rendu serveur
    setSave(read);
  }, []);

  /** Change la sauvegarde : dans la page et dans le stockage. */
  const patch = useCallback((change: Partial<LimitedSave>, quiet = false) => {
    if (!latest.current) return;
    const next = { ...latest.current, ...change };
    latest.current = next;
    writeLimitedSave(next);
    if (!quiet) setSave(next);
  }, []);

  const feed = useLimitedEvent(save ?? null, (record) => patch({ record }));
  const { view, seat } = feed;

  const quit = () => {
    writeLimitedSave(null);
    router.push(LOBBY);
  };

  // Les matchs entre IA se jouent hors de la page, un par un.
  useBotMatches(feed);

  const mine = view ? matchOf(view, seat) : null;
  const pool = view?.you?.pool;
  const deck = useMemo(() => (save?.deck && pool ? fitToPool(save.deck, pool) : emptyDeck()), [save?.deck, pool]);
  const building = view?.phase === "build" && !view.seats[seat]?.ready;
  const problems = useMemo(
    () => (building && feed.status === "ready" ? feed.check(deck) : []),
    // `view.seq` : le moteur a avancé, sa réponse peut changer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [building, feed.status, feed.check, deck, view?.seq],
  );

  // Le match est connu : sa partie est écrite une fois dans la sauvegarde, puis reprise telle quelle.
  const playing = view?.phase === "play" || view?.phase === "done";
  useEffect(() => {
    if (!playing || !mine || latest.current?.match) return;
    const game = feed.game(mine.index);
    if (!game) return;
    const table = mine.match.seats.indexOf(seat);
    patch({
      match: {
        index: mine.index,
        bots: game.bots,
        record: {
          config: {
            ...game.config,
            players: game.config.players.map((player, index) =>
              index === table ? { ...player, manual_pay: true } : player,
            ),
          },
          seed: game.seed,
          actions: [],
        },
      },
    });
  }, [playing, mine, seat, feed, patch]);

  if (save === undefined || (save && feed.status === "loading")) {
    return <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{t("loading")}</p>;
  }

  if (save === null) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">{t("none")}</p>
        <Button asChild>
          <Link href={LOBBY}>{tPlay("solo.toLobby")}</Link>
        </Button>
      </div>
    );
  }

  // Un évènement gardé que le moteur ne sait plus rouvrir (il a changé depuis).
  if (!view) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">{t("broken")}</p>
        {feed.error && <p className="text-xs text-muted-foreground">{feed.error}</p>}
        <Button onClick={quit}>{t("brokenLeave")}</Button>
      </div>
    );
  }

  const { kind } = view;
  const title = t(`title.${kind}`);
  const subtitle = t("subtitle", { players: view.seats.length, sets: [...new Set(view.packs)].join(", ") });
  const out = view.seats[seat]?.out === true;

  const submit = () => {
    const refused = feed.act({ type: "submit", deck });
    if (refused) toast.error(refused);
  };

  const suggest = () => {
    const built = feed.suggest();
    if (!built) {
      toast.error(t("build.noSuggestion"));
      return;
    }
    // Le deck du moteur vient avec ses runes : on les garde telles quelles.
    patch({ deck: built, runesByHand: false });
  };

  const header = (step: EventStep, actions?: React.ReactNode) => (
    <EventHeader title={title} subtitle={subtitle} kind={kind} step={step} onQuit={quit}>
      {actions}
    </EventHeader>
  );

  if (out && !mine) {
    return (
      <div className="flex flex-col gap-4">
        {header("build")}
        <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{t("out")}</p>
      </div>
    );
  }

  if (view.phase === "draft") {
    return (
      <div className="flex flex-col gap-4">
        {header("open")}
        <DraftScreen
          view={view}
          seat={seat}
          cards={cards}
          onPick={(card) => feed.act({ type: "pick", code: card.code, foil: card.foil === true })}
        />
      </div>
    );
  }

  if (view.phase === "build") {
    if (!building) {
      return (
        <div className="flex flex-col gap-4">
          {header("build")}
          <SeatStrip view={view} seat={seat} />
          <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground" role="status">
            {t("build.waiting")}
          </p>
        </div>
      );
    }
    const opened = save.opened ?? 0;
    if (kind === "sealed" && opened < view.packs.length) {
      return (
        <div className="flex flex-col gap-4">
          {header("open")}
          <SealedOpening
            view={view}
            seat={seat}
            cards={cards}
            opened={opened}
            onOpened={(next) => patch({ opened: next })}
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        {header(
          "build",
          <>
            <Button variant="outline" onClick={suggest}>
              {t("build.suggest")}
            </Button>
            <Button disabled={problems.length > 0} onClick={submit}>
              {t("build.submit")}
            </Button>
          </>,
        )}
        <BuildScreen
          view={view}
          seat={seat}
          cards={cards}
          deck={deck}
          runesByHand={save.runesByHand === true}
          problems={problems}
          onDeck={(next: EngineDeckList, runesByHand: boolean) => patch({ deck: next, runesByHand })}
        />
      </div>
    );
  }

  // Les matchs : le mien sur la table, puis le bilan.
  if (mine && save.match && (atTable || !mine.match.done) && !summary) {
    return (
      <MatchTable
        key={save.match.record.seed}
        save={save}
        cards={cards}
        match={mine.match}
        seat={seat}
        note={`${title} · ${t("step.match")}`}
        onRecord={(record) => patch({ match: latest.current?.match && { ...latest.current.match, record } }, true)}
        onResult={(winner) => feed.report(mine.index, winner)}
        onSeated={() => setAtTable(true)}
        onLeave={() => setSummary(true)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header("match")}
      <LimitedResults
        view={view}
        seat={seat}
        cards={cards}
        deck={view.you?.deck ?? null}
        onReplay={
          mine && save.match
            ? () => {
                // Une revanche pour le plaisir : même decks, autre graine. Le résultat de l'évènement reste.
                patch({
                  match: {
                    ...save.match!,
                    record: { ...save.match!.record, seed: Math.floor(Math.random() * 2 ** 31) + 1, actions: [] },
                  },
                });
                setSummary(false);
                setAtTable(true);
              }
            : undefined
        }
        onLeave={quit}
      />
    </div>
  );
}

/** Le match du joueur, sur la table de jeu habituelle. */
function MatchTable({
  save,
  cards,
  match,
  seat,
  note,
  onRecord,
  onResult,
  onSeated,
  onLeave,
}: {
  save: LimitedSave;
  cards: TableCards;
  match: LimitedMatch;
  seat: number;
  note: string;
  onRecord: (record: SoloSave["record"]) => void;
  onResult: (winner: number | null) => void;
  /** La table est ouverte : on y reste après la fin de la partie. */
  onSeated: () => void;
  onLeave: () => void;
}) {
  const t = useTranslations("Games.Limited");
  const seated = useRef(onSeated);
  useEffect(() => seated.current(), []);
  // La partie est ouverte une fois : la sauvegarde change à chaque coup, la table reste.
  const [solo] = useState<SoloSave | null>(() =>
    save.match ? { seat: match.seats.indexOf(seat), bots: save.match.bots, record: save.match.record } : null,
  );
  const feed = useSoloGame(solo, { onSave: (next) => onRecord(next.record) });
  const result = feed.update?.view.result ?? null;
  const told = useRef(false);
  useEffect(() => {
    if (!result || told.current) return;
    told.current = true;
    if (!match.done) onResult(matchWinner(match, result.winners));
  }, [result, match, onResult]);

  return (
    <GameTable
      feed={feed}
      cards={cards}
      note={note}
      afterResult={
        <div className="flex flex-row flex-wrap gap-2">
          <Button onClick={onLeave}>{t("match.toResults")}</Button>
        </div>
      }
    />
  );
}

type SimulationReply = { id: number; summary?: { winners: number[]; finished: boolean }; error?: string };

/**
 * Fait jouer les matchs qui n'opposent que des IA, dans un Web Worker (une
 * partie prend jusqu'à une seconde de calcul), et inscrit leur résultat.
 */
function useBotMatches(feed: LimitedFeed): void {
  const { view, game, report } = feed;
  const running = useRef<number | null>(null);
  const worker = useRef<Worker | null>(null);
  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [],
  );

  const next = nextBotMatch(view);
  useEffect(() => {
    if (next === null || running.current !== null || !view) return;
    const job = game(next);
    if (!job) return;
    const match = view.matches[next];
    running.current = next;
    worker.current ??= new Worker(new URL("../simulation.worker.ts", import.meta.url), { type: "module" });
    const current = worker.current;
    current.onmessage = (message: MessageEvent<SimulationReply>) => {
      if (message.data.id !== next) return;
      running.current = null;
      const summary = message.data.summary;
      // Une partie que le moteur n'a pas su finir compte comme nulle : l'évènement ne reste pas bloqué.
      report(next, summary?.finished ? matchWinner(match, summary.winners) : null);
    };
    current.postMessage({ id: next, config: job.config, seed: job.seed, bots: job.bots });
  }, [next, view, game, report]);
}

/** Le premier match encore à jouer dont les deux joueurs sont des IA. */
function nextBotMatch(view: LimitedView | null): number | null {
  if (!view || view.phase !== "play") return null;
  const index = view.matches.findIndex((match) => !match.done && match.seats.every((seat) => view.seats[seat]?.bot));
  return index < 0 ? null : index;
}
