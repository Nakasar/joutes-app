"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, Copy, UserRound, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  addLimitedBotAction,
  joinLimitedEventAction,
  leaveLimitedSeatAction,
  readLimitedEventAction,
  startLimitedEventAction,
  type LimitedEventState,
} from "@/app/[locale]/(app)/games/riftbound/play/limited/actions";
import type { LimitedKit, MatchRecord } from "@/components/play/limited/kit";
import { OnlineLimited } from "@/components/play/limited/OnlineLimited";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import type { PlayResult } from "@/lib/engine/table-actions";
import { BOT_LEVELS, type BotLevel } from "@/lib/engine/types";

const POLL_MS = 3000;

/** Un délai en clair : « 60 s », « 20 min », ou « sans limite ». */
export function useDelayLabel(): (seconds: number) => string {
  const t = useTranslations("Games.Limited");
  return (seconds) =>
    seconds === 0
      ? t("setup.noLimit")
      : seconds < 120
        ? t("setup.seconds", { count: seconds })
        : t("setup.minutes", { count: Math.round(seconds / 60) });
}

/** Le message d'un refus : celui des évènements s'il existe, sinon celui des tables. */
export function useLimitedError(): (code: string) => string {
  const t = useTranslations("Games.Limited");
  const tPlay = useTranslations("Games.Play");
  return (code) => (t.has(`online.error.${code}`) ? t(`online.error.${code}`) : tPlay(`error.${code}`));
}

/**
 * Un scellé ou un draft en ligne : la salle d'attente tenue par Joutes, puis
 * l'évènement sur le serveur de parties. Le code est lu dans l'adresse (`?id=`).
 */
export function LimitedRoom<D, C, R extends MatchRecord, G>({ kit }: { kit: LimitedKit<D, C, R, G> }) {
  const LOBBY = kit.base;
  const { game } = kit;
  const t = useTranslations("Games.Limited");
  const tPlay = useTranslations("Games.Play");
  const errorText = useLimitedError();
  const delayLabel = useDelayLabel();
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const [state, setState] = useState<LimitedEventState | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // L'adresse est gardée telle qu'elle a été reçue : chaque lecture signe un
  // nouveau ticket, et changer d'adresse couperait la connexion pour rien.
  const [socket, setSocket] = useState<{ event: string; url: string; server: string } | null>(null);

  const refresh = useCallback(async (): Promise<LimitedEventState | null> => {
    const result = await readLimitedEventAction(game, id);
    if (!result.ok) {
      setFailure(result.error);
      return null;
    }
    const { access } = result.state;
    setFailure(null);
    setState(result.state);
    setSocket((previous) =>
      access
        ? previous?.event === access.event
          ? previous
          : { event: access.event, url: access.ws, server: access.server }
        : null,
    );
    return result.state;
  }, [id, game]);

  const renew = useCallback(async () => (await refresh())?.access?.ws ?? null, [refresh]);

  const waiting = state?.event.status === "waiting";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- première lecture de l'évènement au montage
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, refresh]);

  const run = async (action: () => Promise<PlayResult>) => {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      toast.error(
        result.details?.length ? `${errorText(result.error)} ${result.details.join(" ")}` : errorText(result.error),
      );
    }
    await refresh();
  };

  const closed = (message: string) => (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
      <p className="text-muted-foreground">{message}</p>
      <Button asChild>
        <Link href={LOBBY}>{tPlay("solo.toLobby")}</Link>
      </Button>
    </div>
  );

  if (failure) return closed(errorText(failure));
  if (!state) {
    return <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{t("loading")}</p>;
  }

  const { event } = state;
  if (event.status === "cancelled") return closed(t("room.cancelled"));

  if (event.status === "playing") {
    return (
      <OnlineLimited
        kit={kit}
        key={socket?.event ?? "none"}
        url={socket?.url ?? null}
        server={socket?.server ?? ""}
        renew={renew}
        storageKey={`${socket?.event ?? event.id}.${state.seat ?? "watch"}`}
      />
    );
  }

  const free = event.players - event.seats.length;
  const link = typeof window === "undefined" ? "" : window.location.href;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <div className="flex flex-row flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t(`room.title.${event.kind}`)}</h2>
          <Badge variant="secondary">{tPlay("room.code", { code: event.id })}</Badge>
        </div>
        <p className="text-sm">
          {t("room.settings", { players: event.players, sets: [...new Set(event.packs)].join(", ") })}
        </p>
        <p className="text-sm text-muted-foreground">
          {event.kind === "draft"
            ? t("room.timersDraft", { pick: delayLabel(event.timers.pick), build: delayLabel(event.timers.build) })
            : t("room.timersSealed", { build: delayLabel(event.timers.build) })}
        </p>
        <p className="text-sm text-muted-foreground">{t("room.invite")}</p>
        <div className="flex flex-row flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(link).then(() => toast.success(tPlay("room.copied")));
            }}
          >
            <Copy aria-hidden />
            {tPlay("room.copy")}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold">{tPlay("room.seats", { taken: event.seats.length, total: event.players })}</h3>
        <ul className="flex flex-col gap-2">
          {event.seats.map((seat, index) => (
            <li key={index} className="flex flex-row flex-wrap items-center gap-2 rounded-lg border p-2">
              {seat.bot ? <Bot className="size-4" aria-hidden /> : <UserRound className="size-4" aria-hidden />}
              <span className="font-medium">{seat.name}</span>
              {seat.bot && (
                <span className="text-sm text-muted-foreground">
                  {tPlay("room.botSeat", { level: tPlay(`level.${seat.bot}`) })}
                </span>
              )}
              {seat.host && <Badge variant="secondary">{tPlay("room.host")}</Badge>}
              {(state.isHost || state.seat === index) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const result = await leaveLimitedSeatAction(game, event.id, index, seat.name);
                      if (result.ok && state.seat === index && state.isHost) router.push(LOBBY);
                      return result;
                    })
                  }
                >
                  <X aria-hidden />
                  {state.seat === index ? (state.isHost ? t("room.cancel") : tPlay("room.leave")) : tPlay("room.remove")}
                </Button>
              )}
            </li>
          ))}
          {Array.from({ length: free }, (_, index) => (
            <li key={`free-${index}`} className="rounded-lg border border-dashed p-2 text-sm text-muted-foreground">
              {tPlay("room.freeSeat")}
            </li>
          ))}
        </ul>

        {state.isHost && (
          <>
            <div className="flex flex-row flex-wrap items-center gap-2 pt-2">
              {free > 0 &&
                BOT_LEVELS.map((level: BotLevel) => (
                  <Button
                    key={level}
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => run(() => addLimitedBotAction(game, event.id, level))}
                  >
                    <Bot aria-hidden />
                    {tPlay("room.addBot", { level: tPlay(`level.${level}`) })}
                  </Button>
                ))}
              <Button
                className="ml-auto"
                disabled={busy || event.seats.length < 2}
                onClick={() => run(() => startLimitedEventAction(game, event.id))}
              >
                {event.seats.length < 2 ? t("room.needTwo") : t("room.start", { count: event.seats.length })}
              </Button>
            </div>
            {free > 0 && event.seats.length >= 2 && <p className="text-xs text-muted-foreground">{t("room.freeHint")}</p>}
          </>
        )}
        {!state.isHost && state.seat !== null && (
          <p className="pt-2 text-sm text-muted-foreground">{tPlay("room.waitingHost")}</p>
        )}
      </section>

      {state.seat === null && free > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold">{t("room.join")}</h3>
          {!state.signedIn ? (
            <div className="flex flex-row flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">{t("room.signIn")}</p>
              <Button asChild size="sm">
                <Link href="/login">{tPlay("lobby.signIn")}</Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-row flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">{t("room.joinHint")}</p>
              <Button disabled={busy} onClick={() => run(() => joinLimitedEventAction(game, event.id))}>
                {t("room.sit")}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
