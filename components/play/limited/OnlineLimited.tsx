"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { DraftScreen } from "@/components/play/limited/DraftScreen";
import type { LimitedKit, MatchRecord } from "@/components/play/limited/kit";
import { EventHeader, SeatStrip, type EventStep } from "@/components/play/limited/limited-kit";
import { LimitedResults } from "@/components/play/limited/LimitedResults";
import { SealedOpening } from "@/components/play/limited/SealedOpening";
import { useOnlineLimitedEvent } from "@/components/play/limited/useOnlineLimitedEvent";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { matchOf } from "@/lib/engine/limited";
import { cn } from "@/lib/utils";

/** Ce que le navigateur garde d'un évènement en ligne : le deck en chantier, rien que le serveur ne sache déjà. */
type Draft<D> = { deck?: D; runesByHand?: boolean; opened?: number };

const draftKey = (key: string) => `joutes.play.limited.online.${key}`;

function readDraft<D>(key: string): Draft<D> {
  try {
    const raw = window.localStorage.getItem(draftKey(key));
    const draft = raw ? (JSON.parse(raw) as Draft<D> | null) : null;
    return draft && typeof draft === "object" ? draft : {};
  } catch {
    return {};
  }
}

function writeDraft<D>(key: string, draft: Draft<D> | null): void {
  try {
    if (draft) window.localStorage.setItem(draftKey(key), JSON.stringify(draft));
    else window.localStorage.removeItem(draftKey(key));
  } catch {
    // Stockage plein ou refusé : le deck en chantier ne survivra pas à un rechargement.
  }
}

/**
 * Un scellé ou un draft sur un serveur de parties, une fois lancé : drafter ou
 * ouvrir, construire, puis jouer son match sur la table du serveur. La page ne
 * reçoit que ses propres cartes.
 *
 * `url` est l'adresse WebSocket de l'évènement, `server` celle du serveur (les
 * tables des matchs s'y ouvrent), `storageKey` nomme le deck en chantier gardé
 * dans le navigateur. `kit` dit de quel jeu.
 */
export function OnlineLimited<D, C, R extends MatchRecord, G>({
  kit,
  url,
  server,
  renew,
  storageKey,
  note,
}: {
  kit: LimitedKit<D, C, R, G>;
  url: string | null;
  server: string;
  renew?: () => Promise<string | null>;
  storageKey: string;
  /** Une ligne sous le titre de la table du match (« hébergée par … »). */
  note?: string;
}) {
  const t = useTranslations("Games.Limited");
  const tPlay = useTranslations("Games.Play");
  const router = useRouter();
  const { cards, faces } = kit.useCards();
  const LOBBY = kit.base;
  const feed = useOnlineLimitedEvent<D>(url, renew);
  const { view, seat } = feed;
  const [draft, setDraft] = useState<Draft<D>>({});
  const [atTable, setAtTable] = useState(false);
  const [summary, setSummary] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture du stockage après le montage
    setDraft(readDraft<D>(storageKey));
  }, [storageKey]);

  const patch = useCallback(
    (change: Draft<D>) =>
      setDraft((previous) => {
        const next = { ...previous, ...change };
        writeDraft(storageKey, next);
        return next;
      }),
    [storageKey],
  );

  // Un refus du serveur (carte déjà prise, deck illégal) est dit une fois.
  const refusal = feed.error;
  useEffect(() => {
    if (refusal) toast.error(refusal.message);
  }, [refusal]);

  const me = seat === null ? null : (view?.seats[seat] ?? null);
  const pool = view?.you?.pool;
  const deck = useMemo(
    () => (draft.deck && pool ? kit.fitToPool(draft.deck, pool) : kit.emptyDeck()),
    [draft.deck, pool, kit],
  );
  const building = view?.phase === "build" && me !== null && !me.ready && !me.out;

  // Le serveur vérifie le deck à chaque changement, après un court répit.
  const serialized = useMemo(() => JSON.stringify(deck), [deck]);
  const { check, status } = feed;
  useEffect(() => {
    if (!building || status !== "ready") return;
    const timer = window.setTimeout(() => check(deck), 250);
    return () => window.clearTimeout(timer);
    // `serialized` dit quand le deck change vraiment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building, status, serialized, check]);
  const verified = feed.checked?.deck === serialized;
  const problems = verified ? (feed.checked?.problems ?? []) : [];

  if (!url || (feed.status === "error" && !view)) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
        <p>{t("online.unreachable")}</p>
        <p className="text-sm text-muted-foreground">{t("online.unreachableHint")}</p>
        <Button asChild>
          <Link href={LOBBY}>{tPlay("solo.toLobby")}</Link>
        </Button>
      </div>
    );
  }

  if (!view) {
    return <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{t("loading")}</p>;
  }

  const { kind } = view;
  const title = t(`title.${kind}`);
  const subtitle = t("subtitle", { players: view.seats.length, sets: [...new Set(view.packs)].join(", ") });
  const mine = seat === null ? null : matchOf(view, seat);
  const over = view.phase === "done" || (view.phase === "play" && (!mine || mine.match.done));

  const leave = () => {
    writeDraft(storageKey, null);
    router.push(LOBBY);
  };
  const quit = () => {
    // Partir avant la fin, c'est abandonner : le serveur n'attend plus ce siège.
    if (seat !== null && !over && !me?.out) feed.act({ type: "forfeit" });
    leave();
  };

  const clock = <Countdown deadline={feed.deadline} />;
  const header = (step: EventStep, actions?: React.ReactNode) => (
    <EventHeader
      title={title}
      subtitle={subtitle}
      kind={kind}
      step={step}
      onQuit={quit}
      quitBody={seat === null || over ? t("online.quitWatching") : t("online.quitBody")}
    >
      {actions}
    </EventHeader>
  );
  const offline = feed.status === "reconnecting" && (
    <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm" role="status">
      {t("online.reconnecting")}
    </p>
  );
  const strip = <SeatStrip view={view} seat={seat ?? -1} away={feed.away} />;

  // Un spectateur, ou un joueur sorti : il suit la table sans rien voir des cartes.
  if (seat === null || !view.you || (me?.out && !mine)) {
    const step: EventStep = view.phase === "draft" ? "open" : view.phase === "build" ? "build" : "match";
    return (
      <div className="flex flex-col gap-4">
        {header(step)}
        {offline}
        {view.phase === "play" || view.phase === "done" ? (
          <LimitedResults view={view} seat={seat ?? -1} onLeave={leave} />
        ) : (
          <>
            {strip}
            <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground" role="status">
              {seat === null ? t("online.watching") : t("out")}
            </p>
          </>
        )}
      </div>
    );
  }

  if (view.phase === "draft") {
    return (
      <div className="flex flex-col gap-4">
        {header("open", clock)}
        {offline}
        <DraftScreen
          view={view}
          seat={seat}
          faces={faces}
          packSize={kit.rules("draft").packSize}
          onPick={(card) => {
            // Un refus du serveur arrive plus tard, par la connexion.
            feed.act({ type: "pick", code: card.code, foil: card.foil === true });
            return null;
          }}
        />
      </div>
    );
  }

  if (view.phase === "build") {
    if (!building) {
      return (
        <div className="flex flex-col gap-4">
          {header("build")}
          {offline}
          {strip}
          <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground" role="status">
            {t("build.waiting")}
          </p>
        </div>
      );
    }
    const opened = draft.opened ?? 0;
    if (kind === "sealed" && opened < view.packs.length) {
      return (
        <div className="flex flex-col gap-4">
          {header("open", clock)}
          {offline}
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
    const suggest = async () => {
      const built = await feed.suggest();
      if (built) patch({ deck: built, runesByHand: false });
      else toast.error(t("build.noSuggestion"));
    };
    return (
      <div className="flex flex-col gap-4">
        {header(
          "build",
          <>
            {clock}
            <Button variant="outline" onClick={() => void suggest()}>
              {t("build.suggest")}
            </Button>
            <Button disabled={!verified || problems.length > 0} onClick={() => feed.act({ type: "submit", deck })}>
              {t("build.submit")}
            </Button>
          </>,
        )}
        {offline}
        {strip}
        <kit.Build
          view={view}
          seat={seat}
          cards={cards}
          faces={faces}
          deck={deck}
          byHand={draft.runesByHand === true}
          problems={problems}
          onDeck={(next: D, runesByHand: boolean) => patch({ deck: next, runesByHand })}
        />
      </div>
    );
  }

  // Les matchs : le mien sur la table du serveur, puis le bilan.
  if (kit.OnlineMatch && mine && feed.table && (atTable || !mine.match.done) && !summary) {
    return (
      <>
        <Seated onSeated={() => setAtTable(true)} />
        <kit.OnlineMatch
          key={feed.table.game}
          table={feed.table}
          server={server}
          cards={cards}
          note={note ?? `${title} · ${t("step.match")}`}
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
      {offline}
      {mine && !mine.match.done && !feed.table && (
        <p className="rounded-xl border bg-card p-4 text-center text-sm text-muted-foreground" role="status">
          {t("online.tableOpening")}
        </p>
      )}
      <LimitedResults
        view={view}
        seat={seat}
        deck={view.you.deck ? <kit.DeckSummary deck={view.you.deck} cards={cards} faces={faces} /> : undefined}
        onLeave={leave}
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

/** Le temps qu'il me reste pour choisir ou construire ; rien sans délai. */
function Countdown({ deadline }: { deadline: number | null }) {
  const t = useTranslations("Games.Limited");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (deadline === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [deadline]);
  if (deadline === null || now === null) return null;
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const text = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <span
      role="timer"
      aria-label={t("online.timeLeft", { time: text })}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold tabular-nums",
        left <= 10 && "border-destructive text-destructive",
      )}
    >
      <Timer className="size-4" aria-hidden />
      {text}
    </span>
  );
}
