"use client";

import "./cp-table.css";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Cinzel } from "next/font/google";
import { useTranslations } from "next-intl";

import type { CpFeed, CpJournalEntry } from "@/components/play/cyberpunk/useCpSoloGame";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Link } from "@/i18n/navigation";
import { splitCpText, type CpTableCard, type CpTableCards } from "@/lib/engine/cyberpunk/cards";
import {
  choiceCodes,
  clickableKeys,
  GIG_FIELDS,
  gigKey,
  groupChoices,
  isDirect,
  objKey,
  OBJECT_FIELDS,
  subjectOf,
  targetOf,
  zoneKey,
  type Key,
} from "@/lib/engine/cyberpunk/table";
import type {
  CpAction,
  CpCardRef,
  CpChoice,
  CpGear,
  CpGig,
  CpLegend,
  CpPlayer,
  CpUnit,
} from "@/lib/engine/cyberpunk/types";
import { cn } from "@/lib/utils";

// Les titres gravés du plateau, comme sur les tables Riftbound et SWU.
const cinzel = Cinzel({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-engrave", display: "swap" });

/** Le temps laissé à chaque ligne du récit, en millisecondes. */
const SPEEDS = { slow: 1700, normal: 1000, fast: 500, instant: 0 } as const;
type Speed = keyof typeof SPEEDS;
const SPEED_STORAGE_KEY = "joutes.play.cp.speed";

/** Les lignes qui se lisent d'un coup d'œil : elles passent plus vite. */
const MINOR_EVENTS = new Set(["spent", "readied", "drew", "ready_step", "eddies_readied", "turn_started", "passed", "react_ended"]);

/** Le nombre de Gigs qui fait gagner (règle 1.10). */
const GIGS_TO_WIN = 7;

type Inspect = { code: string | null; unit?: CpUnit; legend?: CpLegend };
type Pile = { kind: "trash" | "removed"; seat: number };

type CpTableProps = {
  feed: CpFeed;
  cards: CpTableCards;
  /** Ce qui suit l'annonce du résultat : rejouer, retour à l'accueil. */
  afterResult?: ReactNode;
};

function readSpeed(): Speed {
  try {
    const stored = window.localStorage.getItem(SPEED_STORAGE_KEY);
    return stored && stored in SPEEDS ? (stored as Speed) : "normal";
  } catch {
    return "normal";
  }
}

/**
 * La table de Cyberpunk TCG : pour chaque joueur, ses trois Légendes, son
 * terrain et sa zone de Gigs. Ce que le moteur permet est cerclé ; une carte
 * qui demande une cible se choisit d'abord, ses cibles s'allument ensuite.
 */
export function CpTable({ feed, cards, afterResult }: CpTableProps) {
  const t = useTranslations("Games.Play");
  const tc = useTranslations("Games.PlayCp");
  const [selected, setSelected] = useState<Key | null>(null);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [pile, setPile] = useState<Pile | null>(null);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [paused, setPaused] = useState(false);
  const [conceding, setConceding] = useState(false);
  // Le récit : tout ce qui précède `cursor` a été raconté.
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- le stockage n'existe que dans le navigateur
    setSpeed(readSpeed());
  }, []);

  const view = feed.update?.view ?? null;
  const prompt = feed.update?.prompt ?? null;
  const watching = feed.seat === null;
  const me = feed.seat ?? 0;
  const rival = 1 - me;

  const codes = useMemo(() => {
    const out = new Map<number, string>();
    if (!view) return out;
    for (const unit of view.field) {
      out.set(unit.id, unit.code);
      for (const gear of unit.gears) out.set(gear.id, gear.code);
    }
    for (const player of view.players) {
      for (const legend of player.legends) {
        if (legend.code) out.set(legend.id, legend.code);
        for (const gear of legend.gears) out.set(gear.id, gear.code);
      }
      for (const card of [...(player.hand ?? []), ...player.trash, ...player.removed]) {
        if (card.code) out.set(card.id, card.code);
      }
    }
    return out;
  }, [view]);
  const { bySubject, loose } = useMemo(
    () => groupChoices(prompt, view ? clickableKeys(view, me) : new Set<Key>()),
    [prompt, view, me],
  );

  // ---- Le récit ----
  const from = Math.max(cursor, feed.toldFrom);
  const queue = speed === "instant" ? [] : feed.journal.filter((entry) => entry.key >= from);
  const telling: CpJournalEntry | undefined = queue[0];
  const tellingKey = telling?.key;
  const tellingType = telling?.event.type;
  const backlog = queue.length;
  useEffect(() => {
    if (tellingKey === undefined) return;
    const pace = SPEEDS[speed] * (MINOR_EVENTS.has(tellingType ?? "") ? 0.45 : 1) * Math.min(1, 6 / backlog);
    const timer = window.setTimeout(() => setCursor(tellingKey + 1), Math.max(140, pace));
    return () => window.clearTimeout(timer);
  }, [tellingKey, tellingType, backlog, speed]);

  const lastKey = feed.journal.length > 0 ? feed.journal[feed.journal.length - 1].key : -1;
  const skip = () => setCursor(lastKey + 1);
  const { hold } = feed;
  const busy = backlog > 0 || paused;
  useEffect(() => {
    hold?.(busy);
  }, [busy, hold]);

  if (feed.status === "loading" || !view) {
    return (
      <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
        {feed.status === "error" ? (feed.error ?? t("status.error")) : t("status.loading")}
      </p>
    );
  }

  const mine = view.players.find((player) => player.seat === me) ?? view.players[0];
  const theirs = view.players.find((player) => player.seat !== me) ?? view.players[1];
  const names = view.players.map((player) => player.name);
  const nameOf = (seat: number) => view.players.find((player) => player.seat === seat)?.name ?? "";

  // La carte choisie n'existe que tant que la question la propose encore.
  const sel = selected !== null && bySubject.has(selected) ? selected : null;
  const selChoices = sel !== null ? (bySubject.get(sel) ?? []) : [];
  const targets = new Map<Key, CpChoice>();
  for (const choice of selChoices) {
    const target = targetOf(choice.action, rival);
    if (target !== null && !targets.has(target)) targets.set(target, choice);
  }

  // Ce que raconte la ligne en cours : ses cartes et ses dés s'allument.
  const focus = new Set<Key>();
  if (telling) {
    for (const field of OBJECT_FIELDS) {
      const value = telling.event[field];
      if (typeof value === "number") focus.add(objKey(value));
    }
    for (const field of GIG_FIELDS) {
      const value = telling.event[field];
      if (typeof value === "number") focus.add(gigKey(value));
    }
  }

  const act = (action: CpAction) => {
    setSelected(null);
    feed.act(action);
  };

  /** Un clic sur ce que la table dessine : la cible attendue, son choix, ou la carte en grand. */
  const click = (key: Key, look: () => void) => {
    const target = sel !== null ? targets.get(key) : undefined;
    if (target) return act(target.action);
    const choices = bySubject.get(key);
    if (!choices) return look();
    if (isDirect(choices)) return act(choices[0].action);
    if (sel === key) {
      // Un second clic joue la carte quand il n'y a qu'une façon de le faire.
      if (choices.length === 1 && targetOf(choices[0].action, rival) === null) return act(choices[0].action);
      return setSelected(null);
    }
    setSelected(key);
  };

  /** L'état d'une carte ou d'un dé, d'après la question en cours. `own` : à moi. */
  const stateOf = (key: Key, own: boolean) => {
    const choices = bySubject.get(key);
    const direct = choices ? isDirect(choices) : false;
    return {
      sel: sel === key,
      // Désigner une carte adverse, c'est la viser.
      tgt: (sel !== null && targets.has(key)) || (sel === null && direct && !own),
      can: sel === null && Boolean(choices) && !(direct && !own),
      dim: sel !== null && sel !== key && !targets.has(key),
      focus: focus.has(key),
    };
  };

  const rich = (text: string, list: Iterable<string>) => (
    <Rich text={text} codes={list} cards={cards} names={names} me={mine.name} onCard={(code) => setInspect({ code })} />
  );
  // Dans un bouton de choix : les noms en couleur, sans en faire des boutons.
  const plain = (text: string, list: Iterable<string>) => (
    <Rich text={text} codes={list} cards={cards} names={names} me={mine.name} />
  );
  const label = (choice: CpChoice) => choice.label;

  const gearTabs = (gears: CpGear[]) => {
    if (gears.length === 0) return null;
    return (
      <div className="cp-gears">
        {gears.map((gear) => {
          const key = objKey(gear.id);
          const state = stateOf(key, true);
          const name = cards[gear.code]?.title ?? gear.name;
          return (
            <button
              key={gear.id}
              type="button"
              className="cp-gear"
              data-can={state.can || undefined}
              data-tgt={state.tgt || undefined}
              title={cards[gear.code]?.name ?? gear.name}
              onClick={(event) => {
                event.stopPropagation();
                click(key, () => setInspect({ code: gear.code }));
              }}
            >
              {name}
            </button>
          );
        })}
      </div>
    );
  };

  const attacker = view.attack?.[0] ?? null;
  const defender = view.attack?.[1] ?? null;
  const gigsAttacked = view.attack !== null && defender === null;

  const unitCard = (unit: CpUnit) => {
    const card = cards[unit.code];
    const key = objKey(unit.id);
    const own = unit.controller === me;
    const base = card?.power ?? null;
    const badges: { label: string; kind?: string }[] = [];
    if (attacker === unit.id) badges.push({ label: tc("tag.attacking"), kind: "attack" });
    if (defender === unit.id) badges.push({ label: tc("tag.defending"), kind: "defend" });
    if (unit.lag) badges.push({ label: tc("kw.lag"), kind: "lag" });
    for (const keyword of unit.keywords) {
      if (keyword === "go_solo" && !unit.solo) continue;
      badges.push({ label: tc(`kw.${keyword}`) });
    }
    return (
      <CardView
        key={unit.id}
        name={card?.name ?? unit.name}
        image={card?.image}
        spent={unit.spent}
        power={unit.power}
        powerShift={base === null ? 0 : Math.sign(unit.power - base)}
        badges={badges.slice(0, 3)}
        hot={attacker === unit.id}
        {...stateOf(key, own)}
        onClick={() => click(key, () => setInspect({ code: unit.code, unit }))}
        onInspect={() => setInspect({ code: unit.code, unit })}
      >
        {gearTabs(unit.gears)}
      </CardView>
    );
  };

  const legendCard = (player: CpPlayer, legend: CpLegend, index: number) => {
    const key = objKey(legend.id);
    const own = player.seat === me;
    const card = legend.code ? cards[legend.code] : undefined;
    const number = tc("legend.number", { n: index + 1 });
    const hidden = !legend.face_up && !legend.peeked && !legend.code;
    const peeked = !legend.face_up && Boolean(legend.code);
    const name = legend.face_up
      ? (card?.name ?? legend.name ?? "")
      : peeked
        ? tc("legend.peeked", { number, name: card?.title ?? legend.name ?? "" })
        : tc("legend.hidden", { number });
    // Les choix d'une Légende à moi (Appeler, Go Solo, effet) : en boutons sous la carte.
    const choices = own && sel === null ? (bySubject.get(key) ?? []) : [];
    const buttons = choices.length > 0 && !isDirect(choices) ? choices : [];
    return (
      <div key={legend.id} className="cp-legcol">
        <CardView
          name={name}
          image={hidden ? undefined : card?.image}
          legend
          back={hidden}
          backNumber={number}
          peek={peeked ? (card?.title ?? legend.name ?? "") : undefined}
          peekLabel={tc("legend.peekTag")}
          spent={legend.spent}
          {...stateOf(key, own)}
          // Une Légende qui n'a que des boutons ne se choisit pas : les boutons suffisent.
          can={stateOf(key, own).can && buttons.length === 0}
          onClick={() =>
            buttons.length > 0
              ? setInspect({ code: legend.code, legend })
              : click(key, () => setInspect({ code: legend.code, legend }))
          }
          onInspect={() => setInspect({ code: legend.code, legend })}
        >
          {gearTabs(legend.gears)}
        </CardView>
        {buttons.length > 0 && (
          <div className="cp-legact">
            {buttons.map((choice, at) => (
              <button
                key={at}
                type="button"
                className="cp-btn"
                data-size="sm"
                data-kind={choice.action.type === "go_solo" || choice.action.type === "call" ? "gold" : undefined}
                title={label(choice)}
                onClick={() => act(choice.action)}
              >
                {choice.action.type === "call"
                  ? tc("legend.call")
                  : choice.action.type === "go_solo"
                    ? tc("legend.goSolo", { cost: card?.cost ?? 0 })
                    : tc("legend.effect")}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const dieView = (gig: CpGig) => {
    const key = gigKey(gig.id);
    // Un dé du fixer est à son propriétaire ; un dé lancé, à qui le contrôle.
    const state = stateOf(key, gig.in_fixer ? gig.owner === me : gig.controller === me);
    const lent = gig.owner !== gig.controller;
    const title = gig.in_fixer
      ? tc("gig.fixer", { die: gig.die })
      : lent
        ? tc("gig.stolen", { die: gig.die, value: gig.value, owner: nameOf(gig.owner) })
        : tc("gig.title", { die: gig.die, value: gig.value });
    return (
      <button
        key={gig.id}
        type="button"
        className="cp-die"
        data-die={gig.die}
        data-fixer={gig.in_fixer || undefined}
        data-lent={lent || undefined}
        data-can={(state.can && !state.sel) || undefined}
        data-tgt={state.tgt || undefined}
        data-focus={(state.focus && !state.can && !state.tgt) || undefined}
        data-dim={state.dim || undefined}
        style={
          {
            "--tone": gig.controller === me ? "var(--cp-me)" : "var(--cp-other)",
            "--lend": gig.owner === me ? "var(--cp-me)" : "var(--cp-other)",
          } as CSSProperties
        }
        title={title}
        aria-label={title}
        onClick={() => click(key, () => undefined)}
      >
        <span className="cp-sh">{gig.in_fixer ? gig.die : gig.value}</span>
        {!gig.in_fixer && <span className="cp-ty">{gig.die}</span>}
        {lent && <span className="cp-own">{tc("gig.from", { name: nameOf(gig.owner) })}</span>}
      </button>
    );
  };

  const half = (player: CpPlayer) => {
    const own = player.seat === me;
    const zone = zoneKey(player.seat);
    const zoneTarget = sel !== null && targets.get(zone);
    const field = view.field.filter((unit) => unit.controller === player.seat);
    const dice = view.gigs.filter((gig) => !gig.in_fixer && gig.controller === player.seat);
    const fixer = view.gigs.filter((gig) => gig.in_fixer && gig.owner === player.seat);
    return (
      <div className="cp-half" data-side={own ? "me" : "other"}>
        <div className="cp-zone" data-zone="legends">
          <h3>{tc("zone.legends")}</h3>
          <div className="cp-legends">{player.legends.map((legend, index) => legendCard(player, legend, index))}</div>
        </div>
        <div className="cp-zone" data-zone="field">
          <h3>{tc("zone.field")}</h3>
          <div className="cp-row">{field.map(unitCard)}</div>
        </div>
        <div
          className="cp-zone"
          data-zone="gigs"
          data-tgt={zoneTarget ? true : undefined}
          data-hot={(!zoneTarget && gigsAttacked && player.seat !== view.active) || undefined}
        >
          <h3>{tc("zone.gigs")}</h3>
          <div className="cp-gigs">
            <div className="cp-dice">{dice.map(dieView)}</div>
            <div className="cp-fxlab">{tc("zone.fixer")}</div>
            <div className="cp-dice" data-fixer="true">
              {fixer.map(dieView)}
            </div>
          </div>
          {zoneTarget && (
            <button
              type="button"
              className="cp-zone-hit"
              aria-label={label(zoneTarget)}
              title={label(zoneTarget)}
              onClick={() => act(zoneTarget.action)}
            />
          )}
        </div>
      </div>
    );
  };

  const band = (player: CpPlayer) => {
    const own = player.seat === me;
    const stat = (name: string, value: ReactNode) => (
      <span className="cp-stat">
        <i>{name}</i>
        {value}
      </span>
    );
    const myTurn = view.active === player.seat && view.phase === "main";
    return (
      <div
        className="cp-band"
        data-active={view.to_act === player.seat || undefined}
        style={{ "--who": own ? "var(--cp-me)" : "var(--cp-other)" } as CSSProperties}
      >
        <span className="cp-name">
          {player.name}
          {own && !watching ? ` (${t("player.you")})` : ""}
        </span>
        {stat(tc("stat.hand"), player.hand_count)}
        {stat(tc("stat.deck"), player.deck_count)}
        <button type="button" className="cp-stat" onClick={() => setPile({ kind: "trash", seat: player.seat })}>
          <i>{tc("stat.trash")}</i>
          {player.trash.length}
        </button>
        {player.removed.length > 0 && (
          <button type="button" className="cp-stat" onClick={() => setPile({ kind: "removed", seat: player.seat })}>
            <i>{tc("stat.removed")}</i>
            {player.removed.length}
          </button>
        )}
        <span className="cp-stat">
          <i>{tc("stat.eddies")}</i>
          {tc("stat.eddiesValue", { ready: player.eddies_ready, total: player.eddies })}
          <span className="cp-pips" aria-hidden>
            {Array.from({ length: Math.min(player.eddies, 20) }, (_, index) => (
              <span key={index} className="cp-pip" data-off={index >= player.eddies_ready || undefined} />
            ))}
          </span>
        </span>
        {stat(tc("stat.cred"), player.street_cred === null ? tc("stat.credNull") : `☆ ${player.street_cred}`)}
        <span className="cp-stat">
          <i>{tc("stat.gigs")}</i>
          {tc("stat.gigsValue", { count: player.gigs, max: GIGS_TO_WIN })}
          <span className="cp-meter" aria-hidden>
            {Array.from({ length: GIGS_TO_WIN }, (_, index) => (
              <span key={index} className="cp-seg" data-on={index < player.gigs || undefined} />
            ))}
          </span>
        </span>
        {myTurn && (
          <>
            <span className="cp-used" data-free={!player.sold || undefined}>
              {tc(player.sold ? "stat.soldDone" : "stat.soldFree")}
            </span>
            <span className="cp-used" data-free={!player.called || undefined}>
              {tc(player.called ? "stat.calledDone" : "stat.calledFree")}
            </span>
          </>
        )}
      </div>
    );
  };

  const handCard = (card: CpCardRef, index: number, count: number, interactive: boolean) => {
    const info = card.code ? cards[card.code] : undefined;
    const key = objKey(card.id);
    const choices = interactive ? bySubject.get(key) : undefined;
    const playable = Boolean(choices?.some((choice) => choice.action.type !== "sell"));
    const sellable = Boolean(choices?.some((choice) => choice.action.type === "sell"));
    const cost = card.cost ?? info?.cost ?? undefined;
    const printed = info?.cost ?? null;
    return (
      <CardView
        key={card.id}
        name={info?.name ?? card.name ?? ""}
        image={info?.image}
        style={{ "--fan": index - (count - 1) / 2 } as CSSProperties}
        sel={sel === key}
        can={interactive && sel === null && Boolean(choices)}
        tgt={sel !== null && targets.has(key)}
        no={interactive && prompt?.kind === "main" && !playable && !sellable}
        tag={sellable ? tc("tag.sell") : undefined}
        cost={
          cost !== undefined && cost !== null
            ? {
                value: cost,
                more: printed !== null && cost > printed,
                less: printed !== null && cost < printed,
                label: tc("cost", { cost }),
              }
            : undefined
        }
        onClick={() =>
          interactive ? click(key, () => setInspect({ code: card.code })) : setInspect({ code: card.code })
        }
        onInspect={() => setInspect({ code: card.code })}
      />
    );
  };

  // ---- La barre de question ----
  const trayChoices = loose.filter((choice) => choice.card && subjectOf(choice.action) !== null);
  const buttonChoices = loose.filter((choice) => !trayChoices.includes(choice));
  const buttonKind = (choice: CpChoice) =>
    choice.action.type === "yes" || choice.action.type === "keep" || choice.action.type === "go_first"
      ? "primary"
      : undefined;
  const acting = view.to_act !== null ? view.players.find((player) => player.seat === view.to_act) : undefined;
  const selCode = sel?.startsWith("o") ? codes.get(Number(sel.slice(1))) : undefined;
  // Les choix de la carte choisie qui ne visent rien sur la table, et l'attaque des Gigs.
  const selButtons = selChoices.filter((choice) => {
    const target = targetOf(choice.action, rival);
    return target === null || target === zoneKey(rival);
  });

  const result = view.result as { winners?: number[]; reason?: string } | null;
  const winners = result?.winners ?? [];
  const reacting = prompt?.kind === "react";

  const ask = result ? null : (
    <div className="cp-ask" role="region" aria-live="polite" data-alert={(reacting && !sel) || undefined}>
      {telling && (
        <span className="cp-told flex basis-full flex-wrap items-center justify-center gap-2">
          <span>{rich(telling.text, telling.codes)}</span>
          {backlog > 1 && (
            <button type="button" className="cp-btn" data-size="sm" onClick={skip}>
              {t("pace.skip")} ({backlog - 1})
            </button>
          )}
        </span>
      )}
      {sel !== null ? (
        <>
          <strong>{selCode ? (cards[selCode]?.name ?? "") : ""}</strong>
          {selButtons.map((choice, index) => (
            <button key={index} type="button" className="cp-btn" data-kind="primary" onClick={() => act(choice.action)}>
              {plain(label(choice), choiceCodes(choice, codes))}
            </button>
          ))}
          <button type="button" className="cp-btn" onClick={() => setSelected(null)}>
            {tc("ask.cancel")}
          </button>
          {targets.size > 0 && <small>{tc("ask.pickTarget")}</small>}
        </>
      ) : prompt ? (
        <>
          <strong>{rich(prompt.text, [prompt.card ?? "", ...prompt.choices.flatMap((choice) => choice.card ?? [])])}</strong>
          {buttonChoices.slice(0, 12).map((choice, index) => (
            <button
              key={index}
              type="button"
              className="cp-btn"
              data-kind={buttonKind(choice)}
              onClick={() => act(choice.action)}
            >
              {plain(label(choice), choiceCodes(choice, codes))}
            </button>
          ))}
          {trayChoices.length > 0 && (
            <div className="cp-tray">
              {trayChoices.map((choice, index) => {
                const info = cards[choice.card ?? ""];
                return (
                  <CardView
                    key={index}
                    name={label(choice)}
                    image={info?.image}
                    can
                    onClick={() => act(choice.action)}
                    onInspect={() => choice.card && setInspect({ code: choice.card })}
                  />
                );
              })}
            </div>
          )}
          {prompt.kind === "main" && <small>{tc("ask.mainHint", { ready: mine.eddies_ready })}</small>}
          {reacting && <small>{tc("ask.reactHint")}</small>}
          {bySubject.size > 0 && prompt.kind !== "main" && !reacting && <small>{t("prompt.onTable")}</small>}
        </>
      ) : !telling ? (
        <span className="cp-told">
          {watching
            ? paused
              ? t("watch.paused")
              : t("watch.title")
            : acting
              ? t("prompt.waitingFor", { name: acting.name })
              : t("prompt.waiting")}
        </span>
      ) : null}
      {feed.error && <small className="text-destructive">{feed.error}</small>}
    </div>
  );

  const theirHand = theirs.hand ?? [];
  const myHand = mine.hand ?? [];
  const whoOf = (entry: CpJournalEntry) => {
    const seat = entry.event.seat;
    return typeof seat === "number" ? (seat === me ? "me" : "other") : undefined;
  };

  return (
    <div className={cn("cp-table dark", cinzel.variable)}>
      <div className="cp-bar">
        <span className="cp-chip">
          {tc("turn", { turn: view.turn })} · {tc.has(`phase.${view.phase}`) ? tc(`phase.${view.phase}`) : view.phase}
        </span>
        {view.overtime && (
          <span className="cp-chip" data-hot="true">
            {tc("overtime")}
          </span>
        )}
        {feed.status === "reconnecting" && <span className="cp-chip">{t("status.reconnecting")}</span>}
        <span className="cp-sp" />
        {watching && feed.step && (
          <>
            <button type="button" className="cp-btn" data-size="sm" onClick={() => setPaused((value) => !value)}>
              {paused ? t("watch.resume") : t("watch.pause")}
            </button>
            {paused && (
              <button type="button" className="cp-btn" data-size="sm" onClick={feed.step}>
                {t("watch.step")}
              </button>
            )}
          </>
        )}
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <span>{t("pace.settings")}</span>
          <select
            value={speed}
            onChange={(event) => {
              const next = event.target.value as Speed;
              setSpeed(next);
              // Ce qui attendait d'être raconté ne se rejoue pas au changement de rythme.
              skip();
              try {
                window.localStorage.setItem(SPEED_STORAGE_KEY, next);
              } catch {
                // Stockage refusé : le réglage vaut pour cette page.
              }
            }}
            className="h-7 rounded-md border bg-background px-1.5 text-xs text-foreground"
          >
            {(Object.keys(SPEEDS) as Speed[]).map((value) => (
              <option key={value} value={value}>
                {t(`pace.speed.${value}`)}
              </option>
            ))}
          </select>
        </label>
        {!watching &&
          !result &&
          (conceding ? (
            <>
              <span>{t("concede.confirm")}</span>
              <button
                type="button"
                className="cp-btn"
                data-size="sm"
                onClick={() => {
                  setConceding(false);
                  act({ type: "concede" });
                }}
              >
                {t("concede.yes")}
              </button>
              <button type="button" className="cp-btn" data-size="sm" onClick={() => setConceding(false)}>
                {t("concede.no")}
              </button>
            </>
          ) : (
            <button type="button" className="cp-btn" data-size="sm" onClick={() => setConceding(true)}>
              {t("concede.action")}
            </button>
          ))}
        <Link href="/games/cp/play" className="cp-chip hover:text-foreground">
          {t("table.quit")}
        </Link>
      </div>

      <div className="cp-layout">
        <div className="cp-scene">
          {band(theirs)}
          {theirHand.length > 0 && (
            <div className="cp-minihand" aria-label={t("watch.handOf", { name: theirs.name })}>
              {theirHand.map((card, index) => handCard(card, index, 1, false))}
            </div>
          )}
          <div className="cp-board">
            <div className="cp-felt">
              {half(theirs)}
              <div className="cp-mid" />
              {half(mine)}
            </div>
          </div>
          <div className="mt-2">{band(mine)}</div>
          {result && (
            <div className="cp-result" role="status">
              <b>
                {winners.length === 0
                  ? t("result.draw")
                  : !watching && winners.includes(me)
                    ? t("result.won")
                    : t("result.winner", { names: winners.map(nameOf).join(", ") })}
              </b>
              {result.reason && <span className="cp-told">{result.reason}</span>}
              {afterResult}
            </div>
          )}
          {ask}
          <div className="cp-fan" aria-label={watching ? t("watch.handOf", { name: mine.name }) : t("zone.hand")}>
            {myHand.map((card, index) => handCard(card, index, myHand.length, !watching))}
          </div>
        </div>

        <Journal
          title={t("journal.title")}
          empty={t("journal.empty")}
          entries={feed.journal}
          who={whoOf}
          render={(entry) => rich(entry.text, entry.codes)}
        />
      </div>

      <InspectDialog inspect={inspect} cards={cards} onClose={() => setInspect(null)} />
      <PileDialog
        pile={pile}
        players={view.players}
        cards={cards}
        onClose={() => setPile(null)}
        onCard={(code) => setInspect({ code })}
      />
    </div>
  );
}

type CardViewProps = {
  name: string;
  image?: string;
  /** Une Légende : un peu plus petite que les cartes du terrain. */
  legend?: boolean;
  /** Face cachée, inconnue de ce joueur : un dos neutre numéroté. */
  back?: boolean;
  backNumber?: string;
  /** Face cachée mais regardée : le nom de la Légende, pour soi seul. */
  peek?: string;
  peekLabel?: string;
  spent?: boolean;
  power?: number;
  /** La puissance du moment comparée à celle imprimée : 1 au-dessus, -1 en dessous. */
  powerShift?: number;
  badges?: { label: string; kind?: string }[];
  tag?: string;
  cost?: { value: number; more: boolean; less: boolean; label: string };
  sel?: boolean;
  can?: boolean;
  tgt?: boolean;
  dim?: boolean;
  focus?: boolean;
  /** L'attaquant de l'attaque en cours. */
  hot?: boolean;
  no?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
  onInspect?: () => void;
  /** Les Équipements, en onglets au-dessus de la carte. */
  children?: ReactNode;
};

/** Une carte sur la table : son image, sa puissance du moment, et l'état que la question lui donne. */
function CardView({
  name,
  image,
  legend = false,
  back = false,
  backNumber,
  peek,
  peekLabel,
  spent = false,
  power,
  powerShift = 0,
  badges = [],
  tag,
  cost,
  sel,
  can,
  tgt,
  dim,
  focus,
  hot,
  no,
  style,
  onClick,
  onInspect,
  children,
}: CardViewProps) {
  const flag = (value: boolean | undefined) => (value ? true : undefined);
  // Une image qui ne se charge pas laisse la place au nom de la carte.
  const [broken, setBroken] = useState<string | null>(null);
  return (
    <div
      className="cp-c"
      data-leg={flag(legend)}
      data-back={flag(back)}
      data-peek={flag(Boolean(peek))}
      data-spent={flag(spent && !sel)}
      data-sel={flag(sel)}
      data-can={flag(can && !sel)}
      data-tgt={flag(tgt && !sel)}
      data-dim={flag(dim && !sel && !tgt)}
      data-focus={flag(focus && !sel && !tgt && !can)}
      data-hot={flag(hot && !sel && !tgt && !can)}
      data-no={flag(no && !sel)}
      style={style}
    >
      {children}
      <button
        type="button"
        className="cp-face"
        title={name}
        aria-label={name}
        aria-pressed={sel || undefined}
        onClick={onClick}
        onContextMenu={(event) => {
          if (!onInspect) return;
          event.preventDefault();
          onInspect();
        }}
      >
        {back ? (
          <span className="cp-q" aria-hidden>
            ?
          </span>
        ) : image && broken !== image ? (
          // eslint-disable-next-line @next/next/no-img-element -- image de carte servie telle quelle
          <img src={image} alt="" loading="lazy" draggable={false} onError={() => setBroken(image)} />
        ) : (
          <span>{name}</span>
        )}
      </button>
      {back && backNumber && <span className="cp-num">{backNumber}</span>}
      {peek && (
        <span className="cp-peek">
          {peekLabel} : {peek}
        </span>
      )}
      {badges.length > 0 && (
        <span className="cp-badges">
          {badges.map((badge) => (
            <span key={badge.label} className="cp-badge" data-kind={badge.kind}>
              {badge.label}
            </span>
          ))}
        </span>
      )}
      {tag && <span className="cp-tag">{tag}</span>}
      {cost && (
        <span className="cp-cost" data-more={flag(cost.more)} data-less={flag(cost.less)} title={cost.label}>
          {cost.value} €$
        </span>
      )}
      {power !== undefined && (
        <span className="cp-pw" data-up={flag(powerShift > 0)} data-down={flag(powerShift < 0)} data-zero={flag(power <= 0)}>
          {power}
        </span>
      )}
    </div>
  );
}

/** Une phrase du moteur : noms de cartes cliquables, noms des joueurs à leur couleur. */
function Rich({
  text,
  codes,
  cards,
  names,
  me,
  onCard,
}: {
  text: string;
  codes: Iterable<string>;
  cards: CpTableCards;
  names: string[];
  me: string;
  /** Absent : les noms de cartes ne s'ouvrent pas (texte d'un bouton). */
  onCard?: (code: string) => void;
}) {
  const parts = splitCpText(text, codes, cards);
  const known = names.filter(Boolean).sort((a, b) => b.length - a.length);
  const pattern =
    known.length > 0
      ? new RegExp(`(${known.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g")
      : null;
  return (
    <>
      {parts.map((part, index) =>
        part.card && onCard ? (
          <button key={index} type="button" className="cp-cardname" onClick={() => onCard(part.card ?? "")}>
            {part.text}
          </button>
        ) : part.card ? (
          <span key={index} className="cp-cardname" data-plain="true">
            {part.text}
          </span>
        ) : pattern ? (
          part.text.split(pattern).map((piece, inner) =>
            known.includes(piece) ? (
              <span key={`${index}-${inner}`} className={piece === me ? "cp-who-me" : "cp-who-other"}>
                {piece}
              </span>
            ) : (
              piece
            ),
          )
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/** Le récit de la partie, tour après tour ; il suit la dernière ligne. */
function Journal({
  title,
  empty,
  entries,
  who,
  render,
}: {
  title: string;
  empty: string;
  entries: CpJournalEntry[];
  who: (entry: CpJournalEntry) => "me" | "other" | undefined;
  render: (entry: CpJournalEntry) => ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = list.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [entries.length]);
  return (
    <aside className="cp-log" aria-label={title}>
      <h4>{title}</h4>
      <div ref={list} className="cp-log-list">
        {entries.length === 0 && <p>{empty}</p>}
        {entries.map((entry) =>
          entry.event.type === "turn_started" ? (
            <h4 key={entry.key}>{entry.text.replace(/\.$/, "")}</h4>
          ) : (
            <p key={entry.key} data-who={who(entry)}>
              {render(entry)}
              {entry.rule ? <span className="cp-rule"> {entry.rule}</span> : null}
            </p>
          ),
        )}
      </div>
    </aside>
  );
}

/** Une carte en grand, avec son texte et, en jeu, ses valeurs du moment. */
function InspectDialog({
  inspect,
  cards,
  onClose,
}: {
  inspect: Inspect | null;
  cards: CpTableCards;
  onClose: () => void;
}) {
  const tc = useTranslations("Games.PlayCp");
  const card: CpTableCard | undefined = inspect?.code ? cards[inspect.code] : undefined;
  const unit = inspect?.unit;
  const hidden = inspect !== null && !inspect.code;
  const title = hidden ? tc("legend.unknownTitle") : (card?.name ?? inspect?.code ?? "");
  return (
    <Dialog open={inspect !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
        {hidden ? (
          <p className="text-sm text-muted-foreground">{tc("legend.unknown")}</p>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex shrink-0 flex-col gap-2 sm:w-56">
              {card?.image && (
                // eslint-disable-next-line @next/next/no-img-element -- image de carte servie telle quelle
                <img src={card.image} alt={card.name} className="w-full rounded-lg" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3 text-sm">
              {card && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">{tc("inspect.kind")}</dt>
                  <dd>{tc(`kind.${card.kind}`)}</dd>
                  {card.cost !== null && (
                    <>
                      <dt className="text-muted-foreground">{tc("inspect.cost")}</dt>
                      <dd>{card.cost} €$</dd>
                    </>
                  )}
                  {(unit || card.power !== null) && (
                    <>
                      <dt className="text-muted-foreground">{tc("inspect.power")}</dt>
                      <dd className="font-semibold">
                        {unit ? unit.power : card.power}
                        {unit && card.power !== null && unit.power !== card.power
                          ? ` (${tc("inspect.printed", { power: card.power })})`
                          : ""}
                      </dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">{tc("inspect.ram")}</dt>
                  <dd>
                    {card.ram} · {tc(`color.${card.color}`)}
                  </dd>
                  {card.tags.length > 0 && (
                    <>
                      <dt className="text-muted-foreground">{tc("inspect.tags")}</dt>
                      <dd>{card.tags.join(", ")}</dd>
                    </>
                  )}
                  {unit && unit.gears.length > 0 && (
                    <>
                      <dt className="text-muted-foreground">{tc("inspect.gears")}</dt>
                      <dd>{unit.gears.map((gear) => cards[gear.code]?.title ?? gear.name).join(", ")}</dd>
                    </>
                  )}
                  {card.sell && (
                    <>
                      <dt className="text-muted-foreground">{tc("inspect.sell")}</dt>
                      <dd>{tc("inspect.sellYes")}</dd>
                    </>
                  )}
                </dl>
              )}
              {inspect?.legend?.peeked && <p className="text-muted-foreground">{tc("legend.peekedHint")}</p>}
              {card?.text && <p className="whitespace-pre-line text-muted-foreground">{withIcons(card.text)}</p>}
              {card && !card.playable && <p className="text-destructive">{tc("inspect.unsupported")}</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Le texte imprimé d'une carte, ses symboles (`{Spend}`, `{Blocker}`…) en pastilles. */
function withIcons(text: string): ReactNode[] {
  return text.split(/(\{[A-Za-z ]+\})/).map((piece, index) =>
    /^\{[A-Za-z ]+\}$/.test(piece) ? (
      <span key={index} className="cp-icon">
        {piece.slice(1, -1)}
      </span>
    ) : (
      piece
    ),
  );
}

/** Une pile consultable : la défausse d'un joueur, ou ses cartes retirées de la partie. */
function PileDialog({
  pile,
  players,
  cards,
  onClose,
  onCard,
}: {
  pile: Pile | null;
  players: CpPlayer[];
  cards: CpTableCards;
  onClose: () => void;
  onCard: (code: string) => void;
}) {
  const tc = useTranslations("Games.PlayCp");
  const player = pile ? players.find((candidate) => candidate.seat === pile.seat) : undefined;
  const list = !player ? [] : pile?.kind === "trash" ? player.trash : player.removed;
  const title = !player ? "" : tc(pile?.kind === "trash" ? "pile.trashOf" : "pile.removedOf", { name: player.name });
  return (
    <Dialog open={pile !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="cp-table max-h-[85dvh] overflow-y-auto border bg-card sm:max-w-2xl">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tc("pile.empty")}</p>
        ) : (
          <div className="flex flex-wrap gap-3 p-1" style={{ "--cw": "76px" } as CSSProperties}>
            {list.map((card) => {
              const info = card.code ? cards[card.code] : undefined;
              return (
                <CardView
                  key={card.id}
                  name={info?.name ?? card.name ?? ""}
                  image={info?.image}
                  onClick={() => card.code && onCard(card.code)}
                />
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
