"use client";

import "./swu-table.css";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";
import { Cinzel } from "next/font/google";
import { useTranslations } from "next-intl";

import type { SwuFeed, SwuJournalEntry } from "@/components/play/swu/useSwuSoloGame";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Link } from "@/i18n/navigation";
import { isLandscape, localizeSwuText, type SwuTableCard, type SwuTableCards } from "@/lib/engine/swu/cards";
import {
  choiceCodes,
  clickableIds,
  groupChoices,
  isDirect,
  subjectOf,
  targetOf,
  viewCodes,
} from "@/lib/engine/swu/table";
import type {
  SwuAction,
  SwuCardRef,
  SwuChoice,
  SwuKeyword,
  SwuPlayer,
  SwuUnit,
  SwuUpgrade,
} from "@/lib/engine/swu/types";
import { cn } from "@/lib/utils";

// Les titres gravés du plateau, comme sur la table Riftbound.
const cinzel = Cinzel({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-engrave", display: "swap" });

/** Le temps laissé à chaque ligne du récit, en millisecondes. */
const SPEEDS = { slow: 1700, normal: 1000, fast: 500, instant: 0 } as const;
type Speed = keyof typeof SPEEDS;
const SPEED_STORAGE_KEY = "joutes.play.swu.speed";

/** Les lignes qui se lisent d'un coup d'œil : elles passent plus vite. */
const MINOR_EVENTS = new Set(["readied", "exhausted", "drew", "resourced", "phase_started", "round_started", "passed"]);

/** Les champs d'un évènement qui désignent une carte de la table. */
const OBJECT_FIELDS = ["card", "obj", "source", "unit", "attacker", "target", "leader", "on", "host"];

/** Les mots-clés qui pèsent sur le choix d'une attaque : affichés sur la carte. */
const SHOWN_KEYWORDS = ["sentinel", "saboteur", "overwhelm", "raid", "hidden", "ambush", "restore", "grit"];

type Inspect = { code: string; unit?: SwuUnit };
type Pile = { kind: "discard" | "resources"; seat: number };

type SwuTableProps = {
  feed: SwuFeed;
  cards: SwuTableCards;
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

function keywordName(keyword: SwuKeyword): { key: string; n?: number } {
  if (typeof keyword === "string") return { key: keyword };
  const [key, n] = Object.entries(keyword)[0] ?? ["", undefined];
  return { key, n };
}

/**
 * La table de Star Wars: Unlimited : deux arènes, et au centre les bases et les
 * leaders. Ce que le moteur permet est cerclé ; une carte qui demande une cible
 * se choisit d'abord, ses cibles s'allument ensuite.
 */
export function SwuTable({ feed, cards, afterResult }: SwuTableProps) {
  const t = useTranslations("Games.Play");
  const ts = useTranslations("Games.PlaySwu");
  const [selected, setSelected] = useState<number | null>(null);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [pile, setPile] = useState<Pile | null>(null);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [paused, setPaused] = useState(false);
  const [conceding, setConceding] = useState(false);
  const [filter, setFilter] = useState("");
  // Le récit : tout ce qui précède `cursor` a été raconté.
  const [cursor, setCursor] = useState(0);
  const dragging = useRef<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- le stockage n'existe que dans le navigateur
    setSpeed(readSpeed());
  }, []);

  const view = feed.update?.view ?? null;
  const prompt = feed.update?.prompt ?? null;
  const watching = feed.seat === null;
  const me = feed.seat ?? 0;

  const codes = useMemo(() => (view ? viewCodes(view) : new Map<number, string>()), [view]);
  const groups = useMemo(
    () => groupChoices(prompt, view ? clickableIds(view, me) : new Set<number>()),
    [prompt, view, me],
  );
  const { bySubject, loose } = groups;

  // ---- Le récit ----
  const from = Math.max(cursor, feed.toldFrom);
  const queue = speed === "instant" ? [] : feed.journal.filter((entry) => entry.key >= from);
  const telling: SwuJournalEntry | undefined = queue[0];
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
    hold(busy);
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

  // La carte choisie n'existe que tant que la question la propose encore.
  const sel = selected !== null && bySubject.has(selected) ? selected : null;
  const selChoices = sel !== null ? (bySubject.get(sel) ?? []) : [];
  const targets = new Map<number, SwuChoice>();
  for (const choice of selChoices) {
    const target = targetOf(choice.action);
    if (target !== null && !targets.has(target)) targets.set(target, choice);
  }
  const selButtons = selChoices.filter((choice) => targetOf(choice.action) === null);

  const focus = new Set<number>();
  if (telling) {
    for (const field of OBJECT_FIELDS) {
      const value = telling.event[field];
      if (typeof value === "number") focus.add(value);
    }
  }
  const hit =
    telling?.event.type === "damaged" && typeof telling.event.target === "number"
      ? { id: telling.event.target, amount: Number(telling.event.amount), key: telling.key }
      : null;

  const act = (action: SwuAction) => {
    setSelected(null);
    setFilter("");
    feed.act(action);
  };

  /** Un clic sur une carte de la table : la cible attendue, l'action de la carte, ou la carte en grand. */
  const click = (id: number, look: () => void) => {
    const target = sel !== null ? targets.get(id) : undefined;
    if (target) return act(target.action);
    const choices = bySubject.get(id);
    if (!choices) return look();
    if (isDirect(choices)) return act(choices[0].action);
    if (sel === id) {
      // Un second clic joue la carte quand il n'y a qu'une façon de le faire.
      if (choices.length === 1 && targetOf(choices[0].action) === null) return act(choices[0].action);
      return setSelected(null);
    }
    setSelected(id);
  };

  /** Une carte de la main lâchée sur la table (`target` nul) ou sur une unité. */
  const drop = (target: number | null) => {
    const id = dragging.current;
    dragging.current = null;
    const choices = id !== null ? bySubject.get(id) : undefined;
    if (id === null || !choices) return;
    const onTarget = target !== null ? choices.find((choice) => targetOf(choice.action) === target) : undefined;
    if (onTarget) return act(onTarget.action);
    const plain = choices.filter((choice) => choice.action.type === "play" && targetOf(choice.action) === null);
    if (plain.length === 1 && choices.length === 1) return act(plain[0].action);
    setSelected(id);
  };
  const allowDrop = (event: DragEvent) => {
    if (dragging.current !== null) event.preventDefault();
  };

  /** L'état d'une carte de la table, d'après la question en cours. */
  const stateOf = (id: number, controller: number) => {
    const choices = bySubject.get(id);
    const direct = choices ? isDirect(choices) : false;
    return {
      sel: sel === id,
      tgt: (sel !== null && targets.has(id)) || (sel === null && direct && controller !== me),
      can: sel === null && Boolean(choices) && !(direct && controller !== me),
      dim: sel !== null && sel !== id && !targets.has(id),
      focus: focus.has(id),
    };
  };

  const rich = (text: string, list: Iterable<string>) => (
    <Rich text={text} codes={list} cards={cards} names={names} me={mine.name} onCard={(code) => setInspect({ code })} />
  );
  const label = (choice: SwuChoice) =>
    localizeSwuText(choice.label, choiceCodes(choice, codes), cards)
      .map((part) => part.text)
      .join("");

  const upgradeTabs = (upgrades: SwuUpgrade[]) => {
    const stacks = new Map<string, { code: string; ids: number[] }>();
    for (const upgrade of upgrades) {
      const stack = stacks.get(upgrade.code) ?? { code: upgrade.code, ids: [] };
      stack.ids.push(upgrade.id);
      stacks.set(upgrade.code, stack);
    }
    if (stacks.size === 0) return null;
    return (
      <div className="swu-ups">
        {[...stacks.values()].map((stack) => {
          const card = cards[stack.code];
          const pickable = stack.ids.find((id) => bySubject.has(id) || (sel !== null && targets.has(id)));
          const name = `${card?.title ?? stack.code}${stack.ids.length > 1 ? ` ×${stack.ids.length}` : ""}`;
          return (
            <button
              key={stack.code}
              type="button"
              className="swu-up"
              data-token={card?.kind === "token_upgrade" || undefined}
              data-can={pickable !== undefined || undefined}
              title={name}
              onClick={() => click(pickable ?? stack.ids[0], () => setInspect({ code: stack.code }))}
            >
              {name}
            </button>
          );
        })}
      </div>
    );
  };

  const unitCard = (unit: SwuUnit) => {
    const card = cards[unit.code];
    const state = stateOf(unit.id, unit.controller);
    const shown = unit.keywords
      .map(keywordName)
      .filter((keyword) => SHOWN_KEYWORDS.includes(keyword.key))
      .sort((a, b) => SHOWN_KEYWORDS.indexOf(a.key) - SHOWN_KEYWORDS.indexOf(b.key))
      .slice(0, 2)
      .map((keyword) => ({ label: ts(`kw.${keyword.key}`, { n: keyword.n ?? 0 }) }));
    if (view.attack?.[0] === unit.id) shown.unshift({ label: ts("tag.attacking") });
    return (
      <CardView
        key={unit.id}
        name={card?.name ?? unit.name}
        // Un leader déployé montre sa face unité quand le catalogue l'a.
        image={unit.leader ? (card?.back ?? card?.image) : card?.image}
        exhausted={unit.exhausted}
        tag={unit.exhausted ? ts("tag.exhausted") : undefined}
        power={unit.power}
        hp={unit.hp}
        damage={unit.damage}
        keywords={shown}
        note={unit.captives.length > 0 ? ts("captives", { count: unit.captives.length }) : undefined}
        float={hit?.id === unit.id ? hit : undefined}
        {...state}
        onClick={() => click(unit.id, () => setInspect({ code: unit.code, unit }))}
        onInspect={() => setInspect({ code: unit.code, unit })}
        onDrop={() => drop(unit.id)}
        onDragOver={allowDrop}
      >
        {upgradeTabs(unit.upgrades)}
      </CardView>
    );
  };

  const arena = (units: SwuUnit[], title: string) => (
    <div className="swu-zone">
      <div className="swu-row">{units.filter((unit) => unit.controller !== me).map(unitCard)}</div>
      <h3>{title}</h3>
      <div className="swu-row">{units.filter((unit) => unit.controller === me).map(unitCard)}</div>
    </div>
  );

  const baseOf = (player: SwuPlayer) => {
    const card = cards[player.base.code];
    const left = Math.max(0, player.base.hp - player.base.damage);
    return (
      <div className="swu-base" style={{ "--who": player.seat === me ? "var(--swu-me)" : "var(--swu-other)" } as CSSProperties}>
        <CardView
          name={ts("baseOf", { name: player.name })}
          image={card?.image}
          land
          float={hit?.id === player.base.id ? hit : undefined}
          {...stateOf(player.base.id, player.seat)}
          onClick={() => click(player.base.id, () => setInspect({ code: player.base.code }))}
          onInspect={() => setInspect({ code: player.base.code })}
        >
          {upgradeTabs(player.base.upgrades ?? [])}
        </CardView>
        <div
          className="swu-life"
          role="img"
          aria-label={`${ts("baseOf", { name: player.name })} : ${ts("life", { left, total: player.base.hp })}`}
        >
          <span style={{ width: `${(left / Math.max(1, player.base.hp)) * 100}%` }} />
          <b>{ts("life", { left, total: player.base.hp })}</b>
        </div>
      </div>
    );
  };

  const leaderOf = (player: SwuPlayer) => {
    const leader = player.leader;
    const card = cards[leader.code];
    const choices = player.seat === me && sel === null ? (bySubject.get(leader.id) ?? []) : [];
    // Déployé, le leader est dans une arène (ou sur un Véhicule) : son emplacement garde sa carte, éteinte.
    const away = leader.deployed;
    return (
      <div className="swu-mid">
        <CardView
          name={card?.name ?? leader.name}
          image={card?.image}
          land
          exhausted={leader.exhausted && !away}
          tag={away ? ts("tag.deployed") : leader.exhausted ? ts("tag.exhausted") : undefined}
          {...(away
            ? { dim: true }
            : stateOf(leader.id, player.seat))}
          onClick={() =>
            away
              ? setInspect({ code: leader.code })
              : click(leader.id, () => setInspect({ code: leader.code }))
          }
          onInspect={() => setInspect({ code: leader.code })}
        />
        {choices.length > 0 && !away && (
          <div className="swu-lead-act">
            {choices.map((choice, index) => (
              <button
                key={index}
                type="button"
                className="swu-btn"
                data-size="sm"
                data-kind={choice.deploy ? "gold" : undefined}
                title={label(choice)}
                onClick={() => act(choice.action)}
              >
                {choice.deploy
                  ? ts(choice.label.includes("Pilot") ? "leader.deployPilot" : "leader.deploy")
                  : ts("leader.action")}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const initiative = (player: SwuPlayer) =>
    view.initiative === player.seat ? (
      <span className="swu-init" data-taken={view.initiative_taken || undefined}>
        ★ {ts(view.initiative_taken ? "initiativeTaken" : "initiative")}
      </span>
    ) : null;

  const band = (player: SwuPlayer) => {
    const own = player.seat === me;
    const stat = (name: string, value: ReactNode) => (
      <span className="swu-stat">
        <i>{name}</i>
        {value}
      </span>
    );
    const resources = (
      <>
        <i>{ts("stat.resources")}</i>
        {ts("stat.resourcesValue", { ready: player.resources_ready, total: player.resources })}
        <span className="swu-pips" aria-hidden>
          {Array.from({ length: Math.min(player.resources, 20) }, (_, index) => (
            <span key={index} className="swu-pip" data-off={index >= player.resources_ready || undefined} />
          ))}
        </span>
      </>
    );
    return (
      <div
        className="swu-band"
        data-active={view.to_act === player.seat || undefined}
        style={{ "--who": own ? "var(--swu-me)" : "var(--swu-other)" } as CSSProperties}
      >
        <span className="swu-name">
          {player.name}
          {own && !watching ? ` (${t("player.you")})` : ""}
        </span>
        {stat(ts("stat.hand"), player.hand_count)}
        {stat(ts("stat.deck"), player.deck_count)}
        <button type="button" className="swu-stat" onClick={() => setPile({ kind: "discard", seat: player.seat })}>
          <i>{ts("stat.discard")}</i>
          {player.discard.length}
        </button>
        {player.resource_cards ? (
          <button type="button" className="swu-stat" onClick={() => setPile({ kind: "resources", seat: player.seat })}>
            {resources}
          </button>
        ) : (
          <span className="swu-stat">{resources}</span>
        )}
        {player.credits > 0 && stat(ts("stat.credits"), player.credits)}
        {player.force && stat(ts("stat.force"), "✦")}
      </div>
    );
  };

  const handCard = (card: SwuCardRef, index: number, count: number, interactive: boolean) => {
    const info = cards[card.code];
    const choices = interactive ? bySubject.get(card.id) : undefined;
    const playable = Boolean(choices);
    const cost = card.cost ?? info?.cost;
    return (
      <CardView
        key={card.id}
        name={info?.name ?? card.name}
        image={info?.image}
        land={info ? isLandscape(info.kind) : false}
        style={{ "--fan": index - (count - 1) / 2 } as CSSProperties}
        sel={sel === card.id}
        can={interactive && sel === null && playable}
        tgt={sel !== null && targets.has(card.id)}
        no={interactive && prompt?.kind === "turn" && !playable}
        cost={
          cost !== undefined && info
            ? { value: cost, more: cost > info.cost, less: cost < info.cost, label: ts("cost", { cost }) }
            : undefined
        }
        draggable={playable && choices?.some((choice) => choice.action.type === "play")}
        onDragStart={() => {
          dragging.current = card.id;
        }}
        onClick={() => (interactive ? click(card.id, () => setInspect({ code: card.code })) : setInspect({ code: card.code }))}
        onInspect={() => setInspect({ code: card.code })}
      />
    );
  };

  // ---- La barre de question ----
  const trayChoices = loose.filter((choice) => choice.card && subjectOf(choice.action) !== null);
  const buttonChoices = loose.filter((choice) => !trayChoices.includes(choice));
  const needle = filter.trim().toLowerCase();
  const manyButtons = buttonChoices.length > 10;
  const shownButtons = (manyButtons && needle ? buttonChoices.filter((choice) => label(choice).toLowerCase().includes(needle)) : buttonChoices).slice(0, manyButtons ? 30 : 10);
  const buttonKind = (choice: SwuChoice) =>
    choice.action.type === "take_initiative"
      ? "gold"
      : choice.action.type === "yes" || choice.action.type === "keep" || choice.deploy
        ? "primary"
        : undefined;
  const acting = view.to_act !== null ? view.players.find((player) => player.seat === view.to_act) : undefined;
  const selCode = sel !== null ? codes.get(sel) : undefined;

  const result = view.result as { winners?: number[]; reason?: string } | null;
  const winners = result?.winners ?? [];

  const ask = result ? null : (
    <div className="swu-ask" role="region" aria-live="polite">
      {telling && (
        <span className="swu-told flex basis-full flex-wrap items-center justify-center gap-2">
          <span>{rich(telling.text, telling.codes)}</span>
          {backlog > 1 && (
            <button type="button" className="swu-btn" data-size="sm" onClick={skip}>
              {t("pace.skip")} ({backlog - 1})
            </button>
          )}
        </span>
      )}
      {sel !== null ? (
        <>
          <strong>{cards[selCode ?? ""]?.name ?? ""}</strong>
          {selButtons.map((choice, index) => (
            <button key={index} type="button" className="swu-btn" data-kind="primary" onClick={() => act(choice.action)}>
              {label(choice)}
            </button>
          ))}
          <button type="button" className="swu-btn" onClick={() => setSelected(null)}>
            {ts("ask.cancel")}
          </button>
          {targets.size > 0 && <small>{ts("ask.pickTarget")}</small>}
        </>
      ) : prompt ? (
        <>
          <strong>{rich(prompt.text, [prompt.card ?? "", ...prompt.choices.flatMap((choice) => choice.card ?? [])])}</strong>
          {manyButtons && (
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t("choices.filter")}
              aria-label={t("choices.filter")}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            />
          )}
          {shownButtons.map((choice, index) => (
            <button
              key={index}
              type="button"
              className="swu-btn"
              data-kind={buttonKind(choice)}
              onClick={() => act(choice.action)}
            >
              {label(choice)}
            </button>
          ))}
          {manyButtons && shownButtons.length === 0 && <small>{t("choices.none")}</small>}
          {trayChoices.length > 0 && (
            <div className="swu-tray">
              {trayChoices.map((choice, index) => {
                const info = cards[choice.card ?? ""];
                return (
                  <CardView
                    key={index}
                    name={label(choice)}
                    image={info?.image}
                    land={info ? isLandscape(info.kind) : false}
                    can
                    onClick={() => act(choice.action)}
                    onInspect={() => choice.card && setInspect({ code: choice.card })}
                  />
                );
              })}
            </div>
          )}
          {prompt.kind === "turn" && <small>{ts("ask.turnHint", { ready: mine.resources_ready })}</small>}
          {bySubject.size > 0 && prompt.kind !== "turn" && <small>{t("prompt.onTable")}</small>}
        </>
      ) : !telling ? (
        <span className="swu-told">
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

  return (
    <div className={cn("swu-table dark", cinzel.variable)}>
      <div className="swu-bar">
        <span className="swu-chip">
          {ts("round", { round: view.round })} · {ts.has(`phase.${view.phase}`) ? ts(`phase.${view.phase}`) : view.phase}
        </span>
        <span className="swu-sp" />
        {watching && (
          <>
            <button type="button" className="swu-btn" data-size="sm" onClick={() => setPaused((value) => !value)}>
              {paused ? t("watch.resume") : t("watch.pause")}
            </button>
            {paused && (
              <button type="button" className="swu-btn" data-size="sm" onClick={feed.step}>
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
                className="swu-btn"
                data-size="sm"
                onClick={() => {
                  setConceding(false);
                  act({ type: "concede" });
                }}
              >
                {t("concede.yes")}
              </button>
              <button type="button" className="swu-btn" data-size="sm" onClick={() => setConceding(false)}>
                {t("concede.no")}
              </button>
            </>
          ) : (
            <button type="button" className="swu-btn" data-size="sm" onClick={() => setConceding(true)}>
              {t("concede.action")}
            </button>
          ))}
        <Link href="/games/swu/play" className="swu-chip hover:text-foreground">
          {t("table.quit")}
        </Link>
      </div>

      <div className="swu-layout">
        <div className="swu-scene">
          {band(theirs)}
          {theirHand.length > 0 && (
            <div className="swu-minihand" aria-label={t("watch.handOf", { name: theirs.name })}>
              {theirHand.map((card, index) => handCard(card, index, 1, false))}
            </div>
          )}
          <div className="swu-stage">
            <div className="swu-board">
              <div className="swu-felt" onDragOver={allowDrop} onDrop={() => drop(null)}>
                {arena(view.ground, ts("arena.ground"))}
                <div className="swu-center">
                  <div className="swu-side">
                    {baseOf(theirs)}
                    {leaderOf(theirs)}
                    {initiative(theirs)}
                  </div>
                  <div className="swu-side">
                    {initiative(mine)}
                    {leaderOf(mine)}
                    {baseOf(mine)}
                  </div>
                </div>
                {arena(view.space, ts("arena.space"))}
              </div>
            </div>
          </div>
          <div className="mt-2">{band(mine)}</div>
          {result && (
            <div className="swu-result" role="status">
              <b>
                {winners.length === 0
                  ? t("result.draw")
                  : !watching && winners.includes(me)
                    ? t("result.won")
                    : t("result.winner", {
                        names: winners.map((seat) => view.players.find((player) => player.seat === seat)?.name).join(", "),
                      })}
              </b>
              {result.reason && <span className="swu-told">{result.reason}</span>}
              {afterResult}
            </div>
          )}
          {ask}
          <div className="swu-fan" aria-label={watching ? t("watch.handOf", { name: mine.name }) : t("zone.hand")}>
            {myHand.map((card, index) => handCard(card, index, myHand.length, !watching))}
          </div>
        </div>

        <Journal
          title={t("journal.title")}
          empty={t("journal.empty")}
          entries={feed.journal}
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
  land?: boolean;
  exhausted?: boolean;
  tag?: string;
  power?: number;
  hp?: number;
  damage?: number;
  keywords?: { label: string }[];
  /** Une précision sous la carte (cartes capturées). */
  note?: string;
  cost?: { value: number; more: boolean; less: boolean; label: string };
  float?: { key: number; amount: number };
  sel?: boolean;
  can?: boolean;
  tgt?: boolean;
  dim?: boolean;
  focus?: boolean;
  no?: boolean;
  style?: CSSProperties;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (event: DragEvent) => void;
  onDrop?: () => void;
  onClick?: () => void;
  onInspect?: () => void;
  /** Les améliorations, en onglets au-dessus de la carte. */
  children?: ReactNode;
};

/** Une carte sur la table : son image, ses chiffres du moment, et l'état que la question lui donne. */
function CardView({
  name,
  image,
  land = false,
  exhausted = false,
  tag,
  power,
  hp,
  damage = 0,
  keywords = [],
  note,
  cost,
  float,
  sel,
  can,
  tgt,
  dim,
  focus,
  no,
  style,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onClick,
  onInspect,
  children,
}: CardViewProps) {
  const flag = (value: boolean | undefined) => (value ? true : undefined);
  // Une image qui ne se charge pas laisse la place au nom de la carte.
  const [broken, setBroken] = useState<string | null>(null);
  return (
    <div
      className="swu-c"
      data-land={flag(land)}
      data-exh={flag(exhausted)}
      data-sel={flag(sel)}
      data-can={flag(can && !sel)}
      data-tgt={flag(tgt && !sel)}
      data-dim={flag(dim && !sel && !tgt)}
      data-focus={flag(focus && !sel && !tgt && !can)}
      data-no={flag(no && !sel)}
      style={style}
      draggable={draggable || undefined}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={
        onDrop
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onDrop();
            }
          : undefined
      }
    >
      {children}
      <button
        type="button"
        className="swu-face"
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
        {image && broken !== image ? (
          // eslint-disable-next-line @next/next/no-img-element -- image de carte servie telle quelle
          <img src={image} alt="" loading="lazy" draggable={false} onError={() => setBroken(image)} />
        ) : (
          <span>{name}</span>
        )}
      </button>
      {tag && <span className="swu-tag">{tag}</span>}
      {keywords.length > 0 && (
        <span className="swu-kws">
          {keywords.map((keyword) => (
            <span key={keyword.label} className="swu-kw">
              {keyword.label}
            </span>
          ))}
        </span>
      )}
      {cost && (
        <span className="swu-cost" data-more={flag(cost.more)} data-less={flag(cost.less)} title={cost.label}>
          {cost.value}
        </span>
      )}
      {damage > 0 && <span className="swu-dmg">−{damage}</span>}
      {power !== undefined && <span className="swu-pw">{power}</span>}
      {hp !== undefined && (
        <span className="swu-hp" data-hurt={flag(damage > 0)}>
          {hp}
        </span>
      )}
      {note && (
        <span className="swu-tag" style={{ top: "auto", bottom: 22 }}>
          {note}
        </span>
      )}
      {float && (
        <span key={float.key} className="swu-float play-float" aria-hidden>
          −{float.amount}
        </span>
      )}
    </div>
  );
}

/** Une phrase du moteur : noms de cartes en français et cliquables, noms des joueurs à leur couleur. */
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
  cards: SwuTableCards;
  names: string[];
  me: string;
  onCard: (code: string) => void;
}) {
  const parts = localizeSwuText(text, codes, cards);
  const known = names.filter(Boolean).sort((a, b) => b.length - a.length);
  const pattern =
    known.length > 0
      ? new RegExp(`(${known.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g")
      : null;
  return (
    <>
      {parts.map((part, index) =>
        part.card ? (
          <button key={index} type="button" className="swu-cardname" onClick={() => onCard(part.card ?? "")}>
            {part.text}
          </button>
        ) : pattern ? (
          part.text.split(pattern).map((piece, inner) =>
            known.includes(piece) ? (
              <span key={`${index}-${inner}`} className={piece === me ? "swu-who-me" : "swu-who-other"}>
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

/** Le récit de la partie, round après round ; il suit la dernière ligne. */
function Journal({
  title,
  empty,
  entries,
  render,
}: {
  title: string;
  empty: string;
  entries: SwuJournalEntry[];
  render: (entry: SwuJournalEntry) => ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = list.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [entries.length]);
  return (
    <aside className="swu-log" aria-label={title}>
      <h4>{title}</h4>
      <div ref={list} className="swu-log-list">
        {entries.length === 0 && <p>{empty}</p>}
        {entries.map((entry) =>
          entry.event.type === "round_started" || entry.event.type === "phase_started" ? (
            <h4 key={entry.key}>{entry.text.replace(/\.$/, "")}</h4>
          ) : (
            <p key={entry.key}>
              {render(entry)}
              {entry.rule ? <span className="swu-rule"> {entry.rule}</span> : null}
            </p>
          ),
        )}
      </div>
    </aside>
  );
}

/** Une carte en grand, avec son texte et, pour une unité en jeu, ses chiffres du moment. */
function InspectDialog({
  inspect,
  cards,
  onClose,
}: {
  inspect: Inspect | null;
  cards: SwuTableCards;
  onClose: () => void;
}) {
  const ts = useTranslations("Games.PlaySwu");
  const card: SwuTableCard | undefined = inspect ? cards[inspect.code] : undefined;
  const unit = inspect?.unit;
  const land = card ? isLandscape(card.kind) : false;
  return (
    <Dialog open={inspect !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>{card?.name ?? inspect?.code ?? ""}</DialogTitle>
        <DialogDescription className="sr-only">{card?.name ?? ""}</DialogDescription>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className={cn("flex shrink-0 flex-col gap-2", land ? "sm:w-80" : "sm:w-56")}>
            {card?.image && (
              // eslint-disable-next-line @next/next/no-img-element -- image de carte servie telle quelle
              <img src={card.image} alt={card.name} className="w-full rounded-lg" />
            )}
            {card?.back && (
              // eslint-disable-next-line @next/next/no-img-element -- image de carte servie telle quelle
              <img src={card.back} alt={ts("inspect.unitSide")} className="w-2/3 self-center rounded-lg" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3 text-sm">
            {unit && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">{ts("inspect.power")}</dt>
                <dd className="font-semibold">{unit.power}</dd>
                <dt className="text-muted-foreground">{ts("inspect.hp")}</dt>
                <dd className="font-semibold">
                  {unit.hp}
                  {unit.damage > 0 ? ` (${ts("inspect.damage", { damage: unit.damage })})` : ""}
                </dd>
                {unit.keywords.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">{ts("inspect.keywords")}</dt>
                    <dd>
                      {unit.keywords
                        .map(keywordName)
                        .map((keyword) =>
                          ts.has(`kw.${keyword.key}`) ? ts(`kw.${keyword.key}`, { n: keyword.n ?? 0 }) : keyword.key,
                        )
                        .join(", ")}
                    </dd>
                  </>
                )}
                {unit.upgrades.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">{ts("inspect.upgrades")}</dt>
                    <dd>{unit.upgrades.map((upgrade) => cards[upgrade.code]?.title ?? upgrade.name).join(", ")}</dd>
                  </>
                )}
                {unit.captives.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">{ts("inspect.captives")}</dt>
                    <dd>{unit.captives.map((captive) => cards[captive.code]?.title ?? captive.name).join(", ")}</dd>
                  </>
                )}
              </dl>
            )}
            {card?.text && <p className="whitespace-pre-line text-muted-foreground">{card.text}</p>}
            {card && !card.playable && <p className="text-destructive">{ts("inspect.unsupported")}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Une pile consultable : la défausse d'un joueur, ou mes ressources. */
function PileDialog({
  pile,
  players,
  cards,
  onClose,
  onCard,
}: {
  pile: Pile | null;
  players: SwuPlayer[];
  cards: SwuTableCards;
  onClose: () => void;
  onCard: (code: string) => void;
}) {
  const ts = useTranslations("Games.PlaySwu");
  const player = pile ? players.find((candidate) => candidate.seat === pile.seat) : undefined;
  const list = !player ? [] : pile?.kind === "discard" ? player.discard : (player.resource_cards ?? []);
  const title = !player
    ? ""
    : ts(pile?.kind === "discard" ? "pile.discardOf" : "pile.resourcesOf", { name: player.name });
  return (
    <Dialog open={pile !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="swu-table max-h-[85dvh] overflow-y-auto border bg-card sm:max-w-2xl">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">{ts("pile.empty")}</p>
        ) : (
          <div className="flex flex-wrap gap-3 p-1" style={{ "--cw": "76px", "--lw": "106px" } as CSSProperties}>
            {list.map((card) => {
              const info = cards[card.code];
              return (
                <CardView
                  key={card.id}
                  name={info?.name ?? card.name}
                  image={info?.image}
                  land={info ? isLandscape(info.kind) : false}
                  onClick={() => onCard(card.code)}
                />
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
