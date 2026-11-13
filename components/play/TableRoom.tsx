"use client";

import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, Copy, UserRound, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import type { PlayResult, TableState } from "@/lib/engine/table-actions";
import type { DeckChoice } from "@/lib/engine/tables";
import { BOT_LEVELS, type BotLevel } from "@/lib/engine/types";

const POLL_MS = 3000;

/** La partie d'une table lancée : chaque jeu y branche sa table et sa connexion. */
export type RoomGameProps = {
  /** Adresse WebSocket de la partie, ticket compris. */
  url: string | null;
  /** Un ticket neuf pour la même partie, quand la connexion ne revient pas. */
  renew: () => Promise<string | null>;
  /** Dit si la partie n'a encore rien montré. */
  onSilent: (silent: boolean) => void;
  /** À montrer quand la partie reste injoignable. */
  unreachable: ReactNode;
  /** À montrer sous le résultat, une fois la partie finie. */
  afterResult: ReactNode;
};

/** Ce qu'un jeu fournit à la salle d'une table en ligne. */
export type RoomKit = {
  /** La page Jouer du jeu (« /games/riftbound/play »). */
  home: string;
  actions: {
    read: (id: string) => Promise<PlayResult<{ state: TableState }>>;
    join: (id: string, choice: DeckChoice | null) => Promise<PlayResult>;
    addBot: (id: string, level: BotLevel) => Promise<PlayResult>;
    leave: (id: string, seat: number, name: string) => Promise<PlayResult>;
    start: (id: string) => Promise<PlayResult>;
  };
  /** Le nom de la carte montrée à un siège (légende, leader), si la page la connaît. */
  cardName: (code: string) => string | undefined;
  /** Le choix du deck de la personne qui s'assoit. */
  Picker: ComponentType<{ value: DeckChoice | null; onChange: (choice: DeckChoice) => void }>;
  Game: ComponentType<RoomGameProps>;
};

/**
 * Une table en ligne, quel que soit le jeu : la salle d'attente, puis la
 * partie sur le serveur de parties.
 */
export function TableRoom({ kit }: { kit: RoomKit }) {
  const t = useTranslations("Games.Play");
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const { home, actions, cardName, Picker, Game } = kit;
  const [state, setState] = useState<TableState | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [choice, setChoice] = useState<DeckChoice | null>(null);
  const [busy, setBusy] = useState(false);
  // L'adresse d'une partie est gardée telle qu'elle a été reçue la première
  // fois : chaque lecture signe un nouveau ticket, et changer d'adresse
  // couperait la connexion pour rien. Elle ne change que si la partie change
  // (lancement raté puis repris) ou disparaît (table revenue en attente).
  const [socket, setSocket] = useState<{ game: string; url: string } | null>(null);
  // Vrai tant que la partie n'a rien montré : la table est alors relue, au cas
  // où son lancement aurait échoué après coup.
  const [silent, setSilent] = useState(true);

  const refresh = useCallback(async (): Promise<TableState | null> => {
    const result = await actions.read(id);
    if (!result.ok) {
      setFailure(result.error);
      return null;
    }
    const { access } = result.state;
    setFailure(null);
    setState(result.state);
    setSocket((previous) =>
      access ? (previous?.game === access.game ? previous : { game: access.game, url: access.ws }) : null,
    );
    return result.state;
  }, [id, actions]);

  /** Un ticket neuf pour la même partie, quand la connexion ne revient pas. */
  const renew = useCallback(async () => (await refresh())?.access?.ws ?? null, [refresh]);

  const status = state?.table.status;
  const waiting = status === "waiting";
  const polling = waiting || (status === "playing" && silent);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- première lecture de la table au montage
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [polling, refresh]);

  const run = async (action: () => Promise<PlayResult>) => {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      toast.error(
        result.details?.length ? `${t(`error.${result.error}`)} ${result.details.join(" ")}` : t(`error.${result.error}`),
      );
    }
    await refresh();
  };

  if (failure) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">{t(`error.${failure}`)}</p>
        <Button asChild>
          <Link href={home}>{t("solo.toLobby")}</Link>
        </Button>
      </div>
    );
  }

  if (!state) {
    return <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{t("status.loading")}</p>;
  }

  const { table } = state;

  if (table.status === "cancelled") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">{t("room.cancelled")}</p>
        <Button asChild>
          <Link href={home}>{t("solo.toLobby")}</Link>
        </Button>
      </div>
    );
  }

  if (table.status !== "waiting") {
    const toLobby = (
      <Button variant="outline" asChild>
        <Link href={home}>{t("result.toLobby")}</Link>
      </Button>
    );
    // Une clé par partie : une table relancée repart d'un récit vide.
    return (
      <Game
        key={socket?.game ?? "none"}
        url={socket?.url ?? null}
        renew={renew}
        onSilent={setSilent}
        afterResult={<div className="flex flex-row flex-wrap gap-2">{toLobby}</div>}
        unreachable={
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
            {table.status === "finished" && table.result ? (
              <>
                <p className="text-lg font-semibold">
                  {table.result.winners.length === 0
                    ? t("result.draw")
                    : t("result.winner", {
                        names: table.result.winners.map((seat) => table.seats[seat]?.name ?? "?").join(", "),
                      })}
                </p>
                <p className="text-sm text-muted-foreground">{table.result.reason}</p>
              </>
            ) : (
              <>
                <p>{t("remote.unreachable")}</p>
                <p className="text-sm text-muted-foreground">{t("room.unreachableHint")}</p>
              </>
            )}
            <Button asChild>
              <Link href={home}>{t("solo.toLobby")}</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const free = table.players - table.seats.length;
  const link = typeof window === "undefined" ? "" : window.location.href;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <div className="flex flex-row flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("room.title", { mode: t(`mode.${table.mode}`) })}</h2>
          <Badge variant="secondary">{t("room.code", { code: table.id })}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{t("room.invite")}</p>
        <div className="flex flex-row flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(link).then(() => toast.success(t("room.copied")));
            }}
          >
            <Copy aria-hidden />
            {t("room.copy")}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold">{t("room.seats", { taken: table.seats.length, total: table.players })}</h3>
        <ul className="flex flex-col gap-2">
          {table.seats.map((seat, index) => (
            <li key={index} className="flex flex-row flex-wrap items-center gap-2 rounded-lg border p-2">
              {seat.bot ? <Bot className="size-4" aria-hidden /> : <UserRound className="size-4" aria-hidden />}
              <span className="font-medium">{seat.name}</span>
              <span className="text-sm text-muted-foreground">
                {seat.bot
                  ? t("room.botSeat", { level: t(`level.${seat.bot}`) })
                  : (cardName(seat.legend) ?? seat.deckName)}
              </span>
              {seat.host && <Badge variant="secondary">{t("room.host")}</Badge>}
              {(state.isHost || state.seat === index) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const result = await actions.leave(table.id, index, seat.name);
                      if (result.ok && state.seat === index && state.isHost) router.push(home);
                      return result;
                    })
                  }
                >
                  <X aria-hidden />
                  {state.seat === index ? (state.isHost ? t("room.cancel") : t("room.leave")) : t("room.remove")}
                </Button>
              )}
            </li>
          ))}
          {Array.from({ length: free }, (_, index) => (
            <li key={`free-${index}`} className="rounded-lg border border-dashed p-2 text-sm text-muted-foreground">
              {t("room.freeSeat")}
            </li>
          ))}
        </ul>

        {state.isHost && (
          <div className="flex flex-row flex-wrap items-center gap-2 pt-2">
            {free > 0 &&
              BOT_LEVELS.map((level: BotLevel) => (
                <Button
                  key={level}
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => actions.addBot(table.id, level))}
                >
                  <Bot aria-hidden />
                  {t("room.addBot", { level: t(`level.${level}`) })}
                </Button>
              ))}
            <Button className="ml-auto" disabled={busy || free > 0} onClick={() => run(() => actions.start(table.id))}>
              {free > 0 ? t("room.waitingPlayers", { count: free }) : t("room.start")}
            </Button>
          </div>
        )}
        {!state.isHost && state.seat !== null && <p className="pt-2 text-sm text-muted-foreground">{t("room.waitingHost")}</p>}
      </section>

      {state.seat === null && free > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold">{t("room.join")}</h3>
          {!state.signedIn ? (
            <div className="flex flex-row flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">{t("room.signIn")}</p>
              <Button asChild size="sm">
                <Link href="/login">{t("lobby.signIn")}</Link>
              </Button>
            </div>
          ) : (
            <>
              <Picker value={choice} onChange={setChoice} />
              <div className="flex flex-row flex-wrap gap-2">
                <Button disabled={busy || !choice} onClick={() => run(() => actions.join(table.id, choice))}>
                  {t("room.sit")}
                </Button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
