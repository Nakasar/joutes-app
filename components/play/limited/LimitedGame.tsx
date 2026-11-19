"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { DraftScreen } from "@/components/play/limited/DraftScreen";
import type { LimitedKit, MatchRecord } from "@/components/play/limited/kit";
import { EventHeader, SeatStrip, type EventStep } from "@/components/play/limited/limited-kit";
import { LimitedResults } from "@/components/play/limited/LimitedResults";
import { SealedOpening } from "@/components/play/limited/SealedOpening";
import { useLimitedEvent, type LimitedFeed } from "@/components/play/limited/useLimitedEvent";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import {
  matchOf,
  matchWinner,
  readLimitedSave,
  writeLimitedSave,
  type LimitedSave,
  type LimitedView,
} from "@/lib/engine/limited";

/**
 * Un scellé ou un draft contre des IA, du premier booster au match : ouvrir
 * (ou drafter), construire, puis jouer un match sur la table. Tout se passe
 * dans le navigateur ; l'évènement est gardé dans `localStorage` et reprend au
 * rechargement. `kit` dit de quel jeu : ses cartes, sa construction, sa table.
 */
export function LimitedGame<D, C, R extends MatchRecord, G>({ kit }: { kit: LimitedKit<D, C, R, G> }) {
  const t = useTranslations("Games.Limited");
  const tPlay = useTranslations("Games.Play");
  const router = useRouter();
  const { cards, faces } = kit.useCards();
  const LOBBY = kit.base;
  const { storageKey } = kit;
  // `undefined` : pas encore lu (le stockage n'existe que dans le navigateur).
  const [save, setSave] = useState<LimitedSave<D, R> | null | undefined>(undefined);
  const latest = useRef<LimitedSave<D, R> | null>(null);
  // Le match vient de finir sous nos yeux : on reste à la table jusqu'à ce que le joueur la quitte.
  const [atTable, setAtTable] = useState(false);
  const [summary, setSummary] = useState(false);

  useEffect(() => {
    const read = readLimitedSave<D, R>(storageKey);
    latest.current = read;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture du stockage après le montage, pour ne pas diverger du rendu serveur
    setSave(read);
  }, [storageKey]);

  /** Change la sauvegarde : dans la page et dans le stockage. */
  const patch = useCallback(
    (change: Partial<LimitedSave<D, R>>, quiet = false) => {
      if (!latest.current) return;
      const next = { ...latest.current, ...change };
      latest.current = next;
      writeLimitedSave(next, storageKey);
      if (!quiet) setSave(next);
    },
    [storageKey],
  );

  const feed = useLimitedEvent<D, G>(kit, save ?? null, (record) => patch({ record }));
  const { view, seat } = feed;

  const quit = () => {
    writeLimitedSave(null, storageKey);
    router.push(LOBBY);
  };

  // Les matchs entre IA se jouent hors de la page, un par un.
  useBotMatches(feed, kit.worker);

  const mine = view ? matchOf(view, seat) : null;
  const pool = view?.you?.pool;
  const kept = save?.deck;
  const deck = useMemo(() => (kept && pool ? kit.fitToPool(kept, pool) : kit.emptyDeck()), [kept, pool, kit]);
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
    patch({ match: { index: mine.index, bots: game.bots, record: kit.soloRecord(game, table) } });
  }, [playing, mine, seat, feed, patch, kit]);

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
          faces={faces}
          packSize={kit.rules("draft").packSize}
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
            faces={faces}
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
        <kit.Build
          view={view}
          seat={seat}
          cards={cards}
          faces={faces}
          deck={deck}
          byHand={save.runesByHand === true}
          problems={problems}
          onDeck={(next: D, runesByHand: boolean) => patch({ deck: next, runesByHand })}
        />
      </div>
    );
  }

  // Les matchs : le mien sur la table, puis le bilan.
  if (mine && save.match && (atTable || !mine.match.done) && !summary) {
    const { match, index } = mine;
    return (
      <>
        <Seated onSeated={() => setAtTable(true)} />
        <kit.SoloMatch
          key={save.match.record.seed}
          save={save.match}
          place={match.seats.indexOf(seat)}
          cards={cards}
          note={`${title} · ${t("step.match")}`}
          onRecord={(record) => patch({ match: latest.current?.match && { ...latest.current.match, record } }, true)}
          onResult={(winners) => {
            if (!match.done) feed.report(index, matchWinner(match, winners));
          }}
          afterResult={
            <div className="flex flex-row flex-wrap gap-2">
              <Button onClick={() => setSummary(true)}>{t("match.toResults")}</Button>
            </div>
          }
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header("match")}
      <LimitedResults
        view={view}
        seat={seat}
        deck={view.you?.deck ? <kit.DeckSummary deck={view.you.deck} cards={cards} faces={faces} /> : undefined}
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

/** Dit une fois que la table du match est ouverte : on y reste après la fin de la partie. */
function Seated({ onSeated }: { onSeated: () => void }) {
  const seated = useRef(onSeated);
  useEffect(() => seated.current(), []);
  return null;
}

type SimulationReply = { id: number; summary?: { winners: number[]; finished: boolean }; error?: string };

/**
 * Fait jouer les matchs qui n'opposent que des IA, dans un Web Worker (une
 * partie prend jusqu'à une seconde de calcul), et inscrit leur résultat.
 */
function useBotMatches<D, G>(feed: LimitedFeed<D, G>, open: () => Worker): void {
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
    worker.current ??= open();
    const current = worker.current;
    current.onmessage = (message: MessageEvent<SimulationReply>) => {
      if (message.data.id !== next) return;
      running.current = null;
      const summary = message.data.summary;
      // Une partie que le moteur n'a pas su finir compte comme nulle : l'évènement ne reste pas bloqué.
      report(next, summary?.finished ? matchWinner(match, summary.winners) : null);
    };
    // Un worker qui ne se charge pas ou plante ne répond jamais : le match compte
    // comme nul, et le prochain match repart sur un worker neuf.
    current.onerror = current.onmessageerror = () => {
      if (running.current !== next) return;
      running.current = null;
      current.terminate();
      if (worker.current === current) worker.current = null;
      report(next, null);
    };
    current.postMessage({ id: next, config: job.config, seed: job.seed, bots: job.bots });
  }, [next, view, game, report, open]);
}

/** Le premier match encore à jouer dont les deux joueurs sont des IA. */
function nextBotMatch(view: LimitedView<unknown> | null): number | null {
  if (!view || view.phase !== "play") return null;
  const index = view.matches.findIndex((match) => !match.done && match.seats.every((seat) => view.seats[seat]?.bot));
  return index < 0 ? null : index;
}
