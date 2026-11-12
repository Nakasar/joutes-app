"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  Circle,
  Coins,
  Crown,
  FastForward,
  Flag,
  Gauge,
  Gem,
  Hand,
  Hourglass,
  Eye,
  Layers,
  Library,
  MoveRight,
  Pause,
  Play,
  SkipForward,
  Plus,
  Skull,
  Star,
  Swords,
  Trash2,
  WifiOff,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

import { CostChips, DragGhost, HandCard, RUNE_MARK, type DragStart } from "@/components/play/HandPlay";
import { PaymentPanel } from "@/components/play/PaymentPanel";
import { PlayCard, type CardSize } from "@/components/play/PlayCard";
import { TableFx } from "@/components/play/TableFx";
import { HandFan, PointRails, TableScene } from "@/components/play/TableScene";
import { ToldText } from "@/components/play/ToldText";
import type { GameFeed } from "@/components/play/game-feed";
import { usePacedFeed, type Ghost, type PacedFeed } from "@/components/play/usePacedFeed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mulliganChoice, mulliganLimit, sortChoices } from "@/lib/engine/anchors";
import type { TableCard, TableCards } from "@/lib/engine/cards";
import {
  abilityKey,
  coverage,
  locKey,
  nextRuneUse,
  payAction,
  proposedChoice,
  sameLoc,
  type PayChoice,
  type RuneUse,
} from "@/lib/engine/payment";
import {
  actorOf,
  battlefieldOf,
  codeOf,
  combatInFocus,
  damageOf,
  eventType,
  objectsOf,
  PACE_SPEEDS,
  revealsCard,
  TABLE_VIEWS,
  type Ack,
} from "@/lib/engine/pacing";
import type {
  EngineAction,
  EngineBattlefield,
  EngineChoice,
  EngineLoc,
  EngineObj,
  EnginePlayHint,
  EnginePlayer,
  EngineTold,
  EngineView,
} from "@/lib/engine/types";
import { DOMAIN_HEX, playerColor, toldIndex } from "@/lib/engine/told-text";
import { cn } from "@/lib/utils";

/** Ordre des domaines dans `pool.power`, celui du moteur. */
const DOMAINS = ["fury", "calm", "mind", "body", "chaos", "order"] as const;

const DOMAIN_COLOR: Record<string, string> = {
  fury: "bg-red-500",
  calm: "bg-emerald-500",
  mind: "bg-sky-500",
  body: "bg-orange-500",
  chaos: "bg-purple-500",
  order: "bg-yellow-400",
};

type Inspected = { obj?: EngineObj; card?: TableCard; playable?: boolean };

/** La carte que le joueur est en train de jouer : posée quelque part, ou en attente d'un emplacement. */
type Intent = { card: number; loc: EngineLoc | null; armed: boolean; sent: boolean };

/** L'état d'un emplacement pendant qu'on joue une carte. */
type DropState = { key: string; state: "ok" | "hot" | "off" | null; onPick?: (event: { clientX: number; clientY: number }) => void };

/** Le nom d'une question : `"pay"`, `"play_location"`, `"priority"`… */
function kindName(kind: unknown): string | null {
  if (typeof kind === "string") return kind;
  if (kind && typeof kind === "object") return Object.keys(kind)[0] ?? null;
  return null;
}

function keyLoc(key: string): EngineLoc | null {
  const [zone, n] = key.split(":");
  if (zone === "base") return { Base: Number(n) };
  if (zone === "bf") return { Bf: Number(n) };
  return null;
}

type GameTableProps = {
  feed: GameFeed;
  cards: TableCards;
  /** Ce qui suit le résultat : rejouer, revenir à l'accueil du jeu… */
  afterResult?: ReactNode;
  /** Une précision dans la barre de la table (le serveur d'une partie hébergée). */
  note?: ReactNode;
  /**
   * Une partie entre IA regardée en spectateur : pause, pas à pas, et le choix
   * de voir les mains.
   */
  watch?: { hands: boolean; onHands: (hands: boolean) => void };
};

/**
 * La table de jeu. Elle ne connaît aucune règle : elle dessine ce que le moteur
 * montre (`view`), pose la question qu'il pose (`prompt`) et lui renvoie, telle
 * quelle, l'une des actions qu'il propose.
 */
export function GameTable({ feed, cards, afterResult, note, watch }: GameTableProps) {
  const t = useTranslations("Games.Play");
  // La partie racontée pas à pas : la vue et le journal suivent le récit, la
  // question n'apparaît qu'une fois le récit arrivé au présent.
  const paced = usePacedFeed(feed);
  const { update, journal } = paced;
  const hold = feed.hold;
  useEffect(() => {
    hold?.(paced.busy || paced.paused);
  }, [hold, paced.busy, paced.paused]);
  // Partie entre IA : Espace met en pause ou reprend (sauf sur un arrêt
  // « Continuer », qui garde la touche).
  const { paused, setPaused } = paced;
  const hasAck = paced.ack !== null;
  useEffect(() => {
    if (!watch || hasAck) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " ") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, input, textarea, select, a, [contenteditable]")) return;
      event.preventDefault();
      setPaused(!paused);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [watch, hasAck, paused, setPaused]);
  // La table occupe tout l'écran : la page du site, dessous, ne défile plus.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, []);
  const [inspected, setInspected] = useState<Inspected | null>(null);
  const [trashOf, setTrashOf] = useState<number | null>(null);
  const [mulliganState, setMulliganState] = useState<{ key: string; ids: number[] }>({ key: "", ids: [] });

  const view = update?.view ?? null;
  const prompt = update?.prompt ?? null;
  const me = feed.seat ?? 0;
  const spectator = feed.seat === null;

  const sorted = useMemo(
    () => (view && prompt ? sortChoices(prompt.choices, view) : null),
    [view, prompt],
  );

  // Les noms à mettre en évidence dans le journal : les joueurs, puis toutes les cartes.
  const playerKey = view ? JSON.stringify(view.players.map((player) => [player.seat, player.name])) : "[]";
  const names = useMemo(() => {
    const players = (JSON.parse(playerKey) as [number, string][]).map(([seat, name]) => ({ seat, name }));
    return toldIndex(players, Object.values(cards));
  }, [playerKey, cards]);

  // La sélection du mulligan ne vaut que pour la question à laquelle elle répond.
  const promptKey = update ? `${update.seq}:${prompt?.text ?? ""}` : "";
  const mulligan = mulliganState.key === promptKey ? mulliganState.ids : [];

  // ---- Jouer une carte : glisser-déposer, bouton Jouer, paiement.
  const [intent, setIntent] = useState<Intent | null>(null);
  const [drag, setDrag] = useState<{ card: number; x: number; y: number; target: string | null } | null>(null);
  const [dropMenu, setDropMenu] = useState<{ card: number; bf: number; x: number; y: number } | null>(null);
  const [handHover, setHandHover] = useState<number | null>(null);
  const [payState, setPayState] = useState<{ key: string; custom: boolean; choice: PayChoice } | null>(null);
  const asking = kindName(prompt?.kind);
  const payment = asking === "pay" ? (prompt?.payment ?? null) : null;
  const plays = prompt?.plays ?? [];
  const hintOf = (card: number) => plays.find((hint) => hint.card === card);
  const act = (action: EngineAction) => feed.act(action);
  const choicesFor = (id: number) => (prompt?.choices ?? []).filter((choice) => choice.action.card === id);
  const playChoiceOf = (card: number) => choicesFor(card).find((choice) => choice.action.type === "play");
  const hideChoicesOf = (card: number) => choicesFor(card).filter((choice) => choice.action.type === "hide");
  /** Où l'on peut poser cette carte : des clés d'emplacement, ou « any » pour un sort. */
  const dropKeysOf = (card: number): string[] => {
    const hint = hintOf(card);
    const hides = hideChoicesOf(card).map((choice) => `bf:${choice.action.bf as number}`);
    if (!playChoiceOf(card)) return hides;
    if (!hint) {
      // Un moteur qui ne donne pas les emplacements : on pose où l'on veut, il demandera.
      return ["any"];
    }
    if (hint.locs.length === 0) return ["any"];
    return [...new Set([...hint.locs.map(locKey), ...hides])];
  };

  const playCard = (card: number, loc: EngineLoc | null) => {
    const choice = playChoiceOf(card);
    setDropMenu(null);
    if (!choice) return;
    setIntent({ card, loc, armed: false, sent: true });
    act(choice.action);
  };
  const dropOn = (card: number, key: string, at: { clientX: number; clientY: number }) => {
    if (key === "any") return playCard(card, null);
    const loc = keyLoc(key);
    if (!loc) return;
    const hide = "Bf" in loc ? hideChoicesOf(card).find((choice) => choice.action.bf === loc.Bf) : undefined;
    const canPlay = Boolean(playChoiceOf(card)) && (hintOf(card)?.locs ?? [loc]).some((l) => sameLoc(l, loc));
    if (hide && canPlay && "Bf" in loc) {
      setIntent(null);
      setDropMenu({ card, bf: loc.Bf, x: at.clientX, y: at.clientY });
    } else if (hide) {
      setIntent(null);
      act(hide.action);
    } else if (canPlay) {
      playCard(card, loc);
    }
  };
  /** Le bouton Jouer : tout de suite s'il n'y a qu'un endroit possible, sinon on attend un clic. */
  const playButton = (card: number) => {
    const keys = dropKeysOf(card);
    if (keys.length === 1 && hideChoicesOf(card).length === 0) {
      return playCard(card, keys[0] === "any" ? null : keyLoc(keys[0]));
    }
    if (keys.length > 0) setIntent({ card, loc: null, armed: true, sent: false });
  };
  const beginDrag = (start: DragStart) => {
    setIntent(null);
    setDropMenu(null);
    setHandHover(null);
    setDrag({ card: start.card, x: start.x, y: start.y, target: null });
  };

  // Pendant le glisser, la carte suit le pointeur ; lâchée sur un emplacement permis, elle s'y joue.
  const dragging = drag !== null;
  const dropRef = useRef({ dropKeysOf, dropOn });
  const dragRef = useRef(drag);
  useEffect(() => {
    dropRef.current = { dropKeysOf, dropOn };
    dragRef.current = drag;
  });
  useEffect(() => {
    if (!dragging) return;
    const targetAt = (x: number, y: number, card: number): string | null => {
      const keys = dropRef.current.dropKeysOf(card);
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const zone = el?.closest("[data-drop]")?.getAttribute("data-drop") ?? null;
      if (zone && keys.includes(zone)) return zone;
      if (keys.includes("any") && el?.closest("[data-play-table]")) return "any";
      return null;
    };
    const move = (event: PointerEvent) => {
      setDrag((current) =>
        current
          ? { ...current, x: event.clientX, y: event.clientY, target: targetAt(event.clientX, event.clientY, current.card) }
          : current,
      );
    };
    const up = (event: PointerEvent) => {
      const current = dragRef.current;
      setDrag(null);
      const target = current ? targetAt(event.clientX, event.clientY, current.card) : null;
      if (current && target) dropRef.current.dropOn(current.card, target, event);
    };
    const cancel = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragging]);

  // Échap : on repose la carte.
  const pending = intent?.armed || dropMenu !== null || dragging;
  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIntent(null);
      setDropMenu(null);
      setDrag(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending]);

  // Le moteur demande où va la carte qu'on vient de poser : on répond pour le joueur.
  const answered = useRef("");
  useEffect(() => {
    if (!prompt || answered.current === promptKey) return;
    if (intent?.sent && asking === "play_location" && intent.loc) {
      const choice = prompt.choices.find(
        (c) => c.action.type === "pick_loc" && sameLoc(c.action.loc as EngineLoc, intent.loc),
      );
      if (choice) {
        answered.current = promptKey;
        act(choice.action);
        return;
      }
    }
    // De retour à la question de priorité : la carte est jouée (ou la déclaration annulée).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la réponse du moteur clôt l'intention
    if (intent?.sent && asking === "priority") setIntent(null);
    // « Payer sans confirmer » : la proposition du moteur part aussitôt.
    if (asking === "pay" && paced.pace.autoPay && prompt.choices[0]?.action.type === "pay") {
      answered.current = promptKey;
      act(prompt.choices[0].action);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptKey]);

  // Le paiement en cours : la proposition du moteur, ou celle que le joueur compose.
  const pay = payment
    ? payState?.key === promptKey
      ? payState
      : { key: promptKey, custom: false, choice: proposedChoice(payment) }
    : null;
  const setPay = (next: { custom: boolean; choice: PayChoice }) => setPayState({ key: promptKey, ...next });
  const confirmPay = () => {
    if (!pay) return;
    const proposed = prompt?.choices.find((choice) => choice.action.type === "pay");
    act(pay.custom || !proposed ? payAction(pay.choice) : proposed.action);
  };
  const payRef = useRef(confirmPay);
  useEffect(() => {
    payRef.current = confirmPay;
  });
  // Espace confirme le paiement, sauf pendant un arrêt « Continuer », qui garde la touche.
  const paying = pay !== null && !hasAck;
  useEffect(() => {
    if (!paying) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " ") return;
      // Un champ, ou un bouton du panneau de paiement, garde la touche ; un bouton de la table
      // (une rune qu'on vient de cliquer) ne doit pas l'avaler.
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [data-pay-panel]")) return;
      event.preventDefault();
      payRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [paying]);

  if (!view) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-xl border bg-card p-8 text-muted-foreground">
        {feed.status === "error" ? (feed.error ?? t("status.error")) : t("status.loading")}
      </div>
    );
  }

  const cardOf = (obj: EngineObj | undefined | null): TableCard | undefined =>
    obj?.code ? cards[obj.code] : undefined;
  const choicesOn = (key: string): EngineChoice[] => sorted?.anchored.get(key) ?? [];
  const choosingOnTable = (sorted?.anchored.size ?? 0) > 0;
  const mulliganing = (sorted?.mulligan.length ?? 0) > 0;
  const mulliganMax = sorted ? mulliganLimit(sorted.mulligan) : 0;

  // Ce que l'évènement raconté concerne : entouré, touché, ou au centre de la table.
  const step = paced.current;
  const focusObjs = new Set(step ? objectsOf(step.entry) : []);
  const focusBf = step ? battlefieldOf(step.entry) : null;
  const hits = step ? damageOf(step.entry) : new Map<number, number>();
  const actor = step ? actorOf(step.entry) : null;
  const scoring =
    step && (eventType(step.entry) === "scored" || eventType(step.entry) === "points")
      ? view.players
          .filter((player) =>
            eventType(step.entry) === "points" ? player.team === step.entry.event.team : player.seat === actor,
          )
          .map((player) => player.seat)
      : [];

  // Paiement personnalisé : un Seal ou un Or se choisit aussi d'un clic sur la table.
  const payAbilitiesOf = (id: number) =>
    pay?.custom ? (payment?.abilities ?? []).filter((ability) => ability.source === id) : [];
  /** Un clic sur l'objet passe à sa capacité suivante, puis à aucune (une seule par source). */
  const cycleAbility = (id: number) => {
    if (!pay) return;
    const keys = payAbilitiesOf(id).map(abilityKey);
    const at = keys.findIndex((key) => pay.choice.abilities.includes(key));
    const next = keys[at + 1];
    const abilities = [...pay.choice.abilities.filter((key) => !keys.includes(key)), ...(next ? [next] : [])];
    setPay({ custom: true, choice: { ...pay.choice, abilities } });
  };
  const toggleAbility = (key: string) => {
    if (!pay) return;
    const source = key.split(":")[0];
    const abilities = pay.choice.abilities.includes(key)
      ? pay.choice.abilities.filter((k) => k !== key)
      : [...pay.choice.abilities.filter((k) => k.split(":")[0] !== source), key];
    setPay({ custom: true, choice: { ...pay.choice, abilities } });
  };
  const renderObj = (obj: EngineObj, size: CardSize = "md") => {
    const sourceKeys = payAbilitiesOf(obj.id).map(abilityKey);
    const source = sourceKeys.length > 0;
    return (
      <PlayCard
        key={obj.id}
        obj={obj}
        card={cardOf(obj)}
        size={size}
        choices={
          source
            ? [{ action: { type: "pay_source" }, label: t("payment.use", { name: cardOf(obj)?.name ?? "" }) }]
            : choicesOn(`obj:${obj.id}`)
        }
        onAct={source ? () => cycleAbility(obj.id) : act}
        onInspect={() => setInspected({ obj, card: cardOf(obj) })}
        dim={choosingOnTable}
        selected={source && sourceKeys.some((key) => pay?.choice.abilities.includes(key))}
        focus={focusObjs.has(obj.id)}
        hit={hits.get(obj.id)}
      />
    );
  };

  // Une carte de la main qu'on peut jouer : aperçu au clic, glisser, bouton Jouer.
  const handPlayCard = (obj: EngineObj, size: CardSize) => {
    const choices = choicesOn(`obj:${obj.id}`);
    const others = choices.filter((choice) => choice.action.type !== "play" && choice.action.type !== "hide");
    const playable = choices.length > 0 && others.length === 0;
    if (spectator || !playable) return renderObj(obj, size);
    return (
      <HandCard
        key={obj.id}
        obj={obj}
        playable
        armed={intent?.armed === true && intent.card === obj.id}
        onPlay={() => playButton(obj.id)}
        onDragStart={beginDrag}
        onHover={(hovered) => setHandHover((current) => (hovered ? obj.id : current === obj.id ? null : current))}
      >
        <PlayCard
          obj={obj}
          card={cardOf(obj)}
          size={size}
          onInspect={() => setInspected({ obj, card: cardOf(obj), playable: true })}
          focus={focusObjs.has(obj.id)}
        />
      </HandCard>
    );
  };

  // Les runes que le paiement utiliserait : pendant le paiement, ou au survol d'une carte jouable.
  const previewCard = drag?.card ?? (intent?.armed ? intent.card : handHover);
  const previewHint = previewCard !== null && previewCard !== undefined ? hintOf(previewCard) : undefined;
  const runeMarks: Record<number, RuneUse> = pay
    ? pay.choice.runes
    : previewHint
      ? proposedChoice(previewHint).runes
      : {};
  const onRune = pay?.custom
    ? (id: number) => {
        const obj = view.bases[me].find((o) => o.id === id);
        const use = nextRuneUse(pay.choice.runes[id] ?? "none", obj?.exhausted === true);
        setPay({ custom: true, choice: { ...pay.choice, runes: { ...pay.choice.runes, [id]: use } } });
      }
    : undefined;

  // L'état de chaque emplacement pendant qu'on joue une carte.
  const placing = drag?.card ?? (intent?.armed ? intent.card : null);
  const placeKeys = placing !== null ? dropKeysOf(placing) : [];
  const dropOf = (key: string): DropState => {
    if (placing === null || placeKeys.includes("any")) return { key, state: null };
    if (!placeKeys.includes(key)) return { key, state: "off" };
    if (drag) return { key, state: drag.target === key ? "hot" : "ok" };
    return { key, state: "ok", onPick: (event) => dropOn(placing, key, event) };
  };
  const anywhere = drag !== null && placeKeys.includes("any");

  const renderGhost = (ghost: Ghost, size: "sm" | "md" = "md") => (
    <PlayCard
      key={`ghost-${ghost.obj.id}`}
      obj={ghost.obj}
      card={cardOf(ghost.obj)}
      size={size}
      dying={ghost.dying}
      focus={focusObjs.has(ghost.obj.id)}
    />
  );
  const ghostsAt = (place: "base" | "bf", index: number) =>
    paced.ghosts.filter((ghost) =>
      place === "base" ? "base" in ghost.place && ghost.place.base === index : "bf" in ghost.place && ghost.place.bf === index,
    );

  const isRune = (obj: EngineObj) => cardOf(obj)?.kind === "rune";
  const others = view.players.filter((player) => player.seat !== me);
  const mine = view.players[me];
  const myHand = spectator ? [] : (mine.hand ?? []);
  const placingObj =
    placing !== null ? [...myHand, ...(mine.champion ? [mine.champion] : [])].find((o) => o.id === placing) : undefined;
  const waitingFor = view.pending && view.pending.seat !== feed.seat ? view.players[view.pending.seat] : null;

  // En relief, la caméra s'approche du combat raconté ; jamais pendant qu'on choisit.
  const relief = paced.pace.view === "3d";
  const dive =
    relief && paced.pace.camera && paced.pace.speed !== "instant" && (paced.busy || paced.ack?.kind === "combat")
      ? // Entre deux évènements racontés, la caméra reste sur le dernier.
        combatInFocus(paced.journal, paced.current ?? { index: paced.journal.length - 1 }, paced.ack)
      : null;

  const seats = view.players.map((player) => player.seat);
  const colorOf = (seat: number) => playerColor(seat, spectator ? null : me, seats);
  const told = (text: string) => (
    <ToldText
      text={text}
      index={names}
      cards={cards}
      colorOf={colorOf}
      onInspect={(card) => setInspected({ card })}
    />
  );

  const toggleMulligan = (id: number) =>
    setMulliganState({
      key: promptKey,
      ids: mulligan.includes(id)
        ? mulligan.filter((value) => value !== id)
        : mulligan.length < mulliganMax
          ? [...mulligan, id]
          : mulligan,
    });

  const handCard = (obj: EngineObj) =>
    mulliganing ? (
      <PlayCard
        key={obj.id}
        obj={obj}
        card={cardOf(obj)}
        size="lg"
        choices={[{ action: { type: "mulligan" }, label: cardOf(obj)?.name ?? obj.name ?? "" }]}
        onAct={() => toggleMulligan(obj.id)}
        onInspect={() => setInspected({ obj, card: cardOf(obj) })}
        selected={mulligan.includes(obj.id)}
      />
    ) : (
      handPlayCard(obj, "lg")
    );
  const handItems = [
    ...(mine.champion && !spectator
      ? [
          {
            key: "champion",
            node: (
              <div className="flex flex-col items-center gap-1">
                {handPlayCard(mine.champion, "lg")}
                <span className="play-engrave text-[0.6rem] uppercase">{t("zone.champion")}</span>
              </div>
            ),
          },
        ]
      : []),
    ...myHand.map((obj) => ({ key: obj.id, node: handCard(obj) })),
  ];

  const board = (
    <>
      {others.map((player) => (
        <BaseStrip
          key={player.seat}
          title={t("zone.baseOf", { name: player.name })}
          choices={choicesOn(`base:${player.seat}`)}
          onAct={act}
          relief={relief}
          drop={dropOf(`base:${player.seat}`)}
        >
          {view.bases[player.seat].filter((obj) => !isRune(obj)).map((obj) => renderObj(obj, "md"))}
          {ghostsAt("base", player.seat).map((ghost) => renderGhost(ghost))}
          <Runes objs={view.bases[player.seat].filter(isRune)} cards={cards} choicesOn={choicesOn} onAct={act} />
          {spectator && player.hand && <SeenHand player={player} renderObj={renderObj} />}
        </BaseStrip>
      ))}

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${view.battlefields.length}, minmax(0, 1fr))` }}
      >
        {view.battlefields.map((bf) => (
          <BattlefieldColumn
            key={bf.index}
            bf={bf}
            view={view}
            me={me}
            showdown={view.showdown?.bf === bf.index}
            focus={focusBf === bf.index}
            ghosts={ghostsAt("bf", bf.index)}
            renderGhost={renderGhost}
            choices={choicesOn(`bf:${bf.index}`)}
            onAct={act}
            card={renderObj(bf.card, "xl")}
            renderObj={renderObj}
            relief={relief}
            colorOf={colorOf}
            drop={dropOf(`bf:${bf.index}`)}
          />
        ))}
      </div>

      <BaseStrip
        title={spectator ? t("zone.baseOf", { name: mine.name }) : t("zone.myBase")}
        choices={choicesOn(`base:${me}`)}
        onAct={act}
        mine
        relief={relief}
        drop={dropOf(`base:${me}`)}
      >
        {view.bases[me].filter((obj) => !isRune(obj)).map((obj) => renderObj(obj, "lg"))}
        {ghostsAt("base", me).map((ghost) => renderGhost(ghost))}
        <Runes
          objs={view.bases[me].filter(isRune)}
          cards={cards}
          choicesOn={choicesOn}
          onAct={act}
          marks={runeMarks}
          onRune={onRune}
        />
      </BaseStrip>
    </>
  );

  const bandOf = (player: EnginePlayer, row: boolean) => (
    <PlayerBand
      key={player.seat}
      row={row}
      player={player}
      view={view}
      isMe={!spectator && player.seat === me}
      away={feed.away.includes(player.seat)}
      choices={choicesOn(`seat:${player.seat}`)}
      onAct={act}
      onTrash={() => setTrashOf(player.seat)}
      acting={actor === player.seat}
      color={colorOf(player.seat)}
      scoring={scoring.includes(player.seat)}
      legendName={cardOf(player.legend)?.name ?? player.legend.name ?? ""}
      legend={renderObj(player.legend, "xs")}
      addedLegends={(player.added_legends ?? []).map((added) => renderObj(added, "xs"))}
      champion={player.champion && (spectator || player.seat !== me) ? renderObj(player.champion, "xs") : null}
    />
  );

  const handSection = spectator ? (
    mine.hand ? (
      <section aria-label={t("watch.handOf", { name: mine.name })} className="min-w-0 flex-1">
        <h3 className="px-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{t("watch.handOf", { name: mine.name })}</span> ·{" "}
          {mine.hand.length}
        </h3>
        <div className="flex items-end gap-2 overflow-x-auto px-1 pb-2 pt-2">
          {mine.hand.map((obj) => renderObj(obj, "md"))}
        </div>
      </section>
    ) : null
  ) : (
    <section data-play-hand aria-label={t("zone.hand")} className="min-w-0 flex-1">
      <h3 className="px-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{t("zone.hand")}</span> · {myHand.length}
      </h3>
      {myHand.length === 0 && !mine.champion ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("zone.emptyHand")}</p>
      ) : relief ? (
        <HandFan items={handItems} />
      ) : (
        <div className="flex items-end gap-2 overflow-x-auto px-1 pb-2 pt-2">
          {mine.champion && (
            <div className="flex shrink-0 flex-col items-center gap-1 border-r pr-3">
              {handPlayCard(mine.champion, "lg")}
              <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{t("zone.champion")}</span>
            </div>
          )}
          {myHand.map(handCard)}
        </div>
      )}
    </section>
  );

  // Au premier plan : votre bandeau (sur ordinateur), puis votre main.
  const foreground = (
    <div className="flex items-end gap-3">
      <div className="hidden w-60 shrink-0 pb-3 lg:block">{bandOf(mine, false)}</div>
      {handSection}
    </div>
  );

  return (
    <div data-play-scroll className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background text-foreground">
      <TableBar paced={paced} view={view} told={told} colorOf={colorOf} note={note} watching={Boolean(watch)} />
      <TableFx current={paced.current} journal={feed.journal} cards={cards} me={me} pace={paced.pace} />
      {drag && (
        <DragGhost
          card={cardOf(placingObj)}
          x={drag.x}
          y={drag.y}
          over={drag.target !== null}
          cost={hintOf(drag.card)?.cost}
        />
      )}
      {dropMenu && (
        <div
          role="menu"
          className="fixed z-[70] flex -translate-x-1/2 -translate-y-full flex-col gap-1.5 rounded-xl border bg-card p-2 shadow-2xl"
          style={{ left: dropMenu.x, top: dropMenu.y - 8 }}
        >
          <Button size="sm" onClick={() => playCard(dropMenu.card, { Bf: dropMenu.bf })}>
            {t("hand.playHere")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const hide = hideChoicesOf(dropMenu.card).find((choice) => choice.action.bf === dropMenu.bf);
              setDropMenu(null);
              if (hide) act(hide.action);
            }}
          >
            {t("hand.hideHere")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDropMenu(null)}>
            {t("hand.cancel")}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3 p-2 max-lg:pb-56 sm:p-3 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-4 lg:px-4">
        {/* Sur téléphone, tous les joueurs en haut, côte à côte. */}
        <div className="grid grid-cols-2 gap-2 lg:hidden">{[...others, mine].map((player) => bandOf(player, false))}</div>

        {/* Table */}
        <main
          data-play-table
          className={cn(
            "relative flex min-w-0 flex-col gap-3 rounded-2xl transition-shadow",
            anywhere && "ring-4 ring-primary/70",
          )}
        >
          {(anywhere || intent?.armed) && (
            <div className="relative z-40 h-0">
              <div
                role="status"
                className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-primary bg-card/95 py-1.5 pl-4 pr-1.5 text-sm font-semibold shadow-lg"
              >
                {anywhere
                  ? t("hand.dropAnywhere")
                  : t("hand.where", { name: (placingObj && cardOf(placingObj)?.name) ?? "" })}
                {intent?.armed && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setIntent(null)}>
                    {t("hand.cancel")}
                  </Button>
                )}
              </div>
            </div>
          )}
          <div className="hidden flex-col gap-2 lg:flex">{others.map((player) => bandOf(player, true))}</div>
          {/* Sous les bandeaux, au bord haut du plateau : la partie est en pause. */}
          {watch && paced.paused && !view.result && (
            <div className="relative z-40 h-0">
              <p
                role="status"
                className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-primary bg-card/95 px-4 py-1.5 text-sm font-semibold shadow-lg"
              >
                <Pause className="size-4" aria-hidden />
                {t("watch.paused")}
              </p>
            </div>
          )}
          <StepOverlay paced={paced} view={view} cards={cards} me={feed.seat} />


          {relief ? (
            <TableScene
              dive={dive}
              rails={
                <PointRails
                  players={view.players}
                  me={spectator ? null : me}
                  max={view.victory_score}
                  colorOf={colorOf}
                  label={(player) =>
                    `${player.name} · ${t("player.points", { points: player.points, max: view.victory_score })}`
                  }
                />
              }
              hand={foreground}
            >
              {board}
            </TableScene>
          ) : (
            <>
              {board}
              <div className="rounded-xl border bg-card p-3">{foreground}</div>
            </>
          )}
        </main>

        {/* Question, chaîne, journal */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)]">
          <section
            aria-live="polite"
            data-play-sheet
            className="flex flex-col gap-3 rounded-2xl border border-primary/40 bg-card bg-gradient-to-b from-primary/15 to-card p-4 shadow-lg max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:max-h-[45dvh] max-lg:overflow-y-auto max-lg:rounded-b-none max-lg:pb-6 max-lg:shadow-2xl"
          >
            {feed.status === "reconnecting" && (
              <p className="flex items-center gap-2 text-sm text-amber-500">
                <WifiOff className="size-4" aria-hidden />
                {t("status.reconnecting")}
              </p>
            )}

            {view.result ? (
              <>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Crown className="size-5 text-yellow-400" aria-hidden />
                  {view.result.winners.length === 0
                    ? t("result.draw")
                    : !spectator && view.result.winners.includes(me)
                      ? t("result.won")
                      : t("result.winner", {
                          names: view.result.winners.map((seat) => view.players[seat].name).join(", "),
                        })}
                </h2>
                <p className="text-sm text-muted-foreground">{view.result.reason}</p>
                {afterResult}
              </>
            ) : paced.ack ? (
              <AckCard ack={paced.ack} view={view} cards={cards} onContinue={paced.proceed} told={told} />
            ) : watch ? (
              <WatchPanel paced={paced} hands={watch.hands} onHands={watch.onHands} turn={view.turn} />
            ) : prompt && sorted ? (
              <>
                <div className="flex items-start gap-3">
                  {prompt.card && cards[prompt.card] && (
                    <PlayCard
                      card={cards[prompt.card]}
                      size="sm"
                      onInspect={() => setInspected({ card: cards[prompt.card as string] })}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold leading-snug">{prompt.text}</h2>
                    {/* Le texte de la carte en cause : c'est lui qui dit ce que
                        valent un « mode 1 » ou un « oui ». */}
                    {prompt.card && cards[prompt.card]?.text && (
                      <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground lg:line-clamp-6">
                        {cards[prompt.card].text}
                      </p>
                    )}
                    {choosingOnTable && <p className="mt-1 text-sm text-primary">{t("prompt.onTable")}</p>}
                    {mulliganing && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("prompt.mulligan", { count: mulligan.length, max: mulliganMax })}
                      </p>
                    )}
                  </div>
                </div>

                {mulliganing && (
                  <div className="flex flex-row flex-wrap gap-2">
                    <Button
                      onClick={() => {
                        const choice = mulliganChoice(sorted.mulligan, mulligan);
                        if (choice) act(choice.action);
                      }}
                      disabled={!mulliganChoice(sorted.mulligan, mulligan)}
                    >
                      {mulligan.length === 0 ? t("prompt.keepHand") : t("prompt.setAside", { count: mulligan.length })}
                    </Button>
                  </div>
                )}

                {payment && pay ? (
                  <PaymentPanel
                    payment={payment}
                    cover={coverage(
                      payment,
                      mine.pool,
                      (id) => {
                        const obj = view.bases[me].find((o) => o.id === id);
                        return (obj?.code ? cards[obj.code]?.domains[0]?.toLowerCase() : null) ?? null;
                      },
                      pay.choice,
                      cards[prompt.card ?? ""]?.kind === "spell",
                    )}
                    choice={pay.choice}
                    custom={pay.custom}
                    objOf={(id) => view.bases[me].find((o) => o.id === id)}
                    cardOf={cardOf}
                    onCustom={(custom) =>
                      setPay({ custom, choice: custom ? pay.choice : proposedChoice(payment) })
                    }
                    onToggleAbility={toggleAbility}
                    onPay={confirmPay}
                    onCancel={(() => {
                      const cancel = prompt.choices.find((choice) => choice.action.type === "cancel");
                      return cancel ? () => act(cancel.action) : null;
                    })()}
                  />
                ) : (
                  sorted.buttons.length > 0 && <ChoiceButtons key={promptKey} choices={sorted.buttons} onAct={act} />
                )}
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Hourglass className="size-4" aria-hidden />
                {paced.busy
                  ? t("pace.telling")
                  : waitingFor
                    ? t("prompt.waitingFor", { name: waitingFor.name })
                    : t("prompt.waiting")}
              </p>
            )}

            {feed.error && view && <p className="text-sm text-destructive">{feed.error}</p>}

          </section>

          {view.chain.length > 0 && (
            <section className="rounded-xl border bg-card p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Layers className="size-4" aria-hidden />
                {t("chain.title")}
              </h3>
              <ol className="flex flex-col-reverse gap-1.5">
                {view.chain.map((item, index) => {
                  const choices = choicesOn(`item:${item.id}`);
                  const label = (
                    <>
                      <span className="text-xs text-muted-foreground">{index + 1}.</span>{" "}
                      <span className="font-medium">{cards[item.code]?.name ?? item.name}</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        {view.players[item.controller]?.name}
                        {item.pending ? ` · ${t("chain.pending")}` : ""}
                      </span>
                    </>
                  );
                  return (
                    <li key={item.id}>
                      {choices.length > 0 ? (
                        <button
                          type="button"
                          title={choices[0].label}
                          onClick={() => act(choices[0].action)}
                          className="w-full rounded-md border px-2 py-1 text-left text-sm ring-2 ring-primary"
                        >
                          {label}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setInspected({ card: cards[item.code] })}
                          className="w-full rounded-md border px-2 py-1 text-left text-sm"
                        >
                          {label}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <Journal entries={journal} told={told} colorOf={colorOf} />

          {!spectator && !view.result && <Concede onConcede={() => act({ type: "concede" })} />}
        </aside>

        <Dialog open={inspected !== null} onOpenChange={(open) => !open && setInspected(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{inspected?.card?.name ?? inspected?.obj?.name ?? t("card.hidden")}</DialogTitle>
              <DialogDescription>
                {inspected?.card ? t(`kind.${inspected.card.kind}`) : t("card.hiddenHint")}
              </DialogDescription>
            </DialogHeader>
            {inspected?.card && (
              <div className="flex flex-col gap-3 sm:flex-row">
                {inspected.card.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={inspected.card.image}
                    alt=""
                    className={cn("mx-auto rounded-lg border", inspected.card.landscape ? "w-full sm:w-64" : "w-48")}
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
                  {inspected.card.text && <p className="whitespace-pre-line">{inspected.card.text}</p>}
                  {inspected.obj && inspected.obj.keywords.length > 0 && (
                    <div className="flex flex-row flex-wrap gap-1">
                      {inspected.obj.keywords.map((keyword) => (
                        <Badge key={keyword} variant="secondary">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {inspected.obj && (
                    <ul className="text-muted-foreground">
                      {inspected.obj.might !== null && (
                        <li>{t("card.might", { might: inspected.obj.might, damage: inspected.obj.damage })}</li>
                      )}
                      {inspected.obj.exhausted && <li>{t("card.exhausted")}</li>}
                      {inspected.obj.stunned && <li>{t("card.stunned")}</li>}
                      {inspected.obj.buffs > 0 && <li>{t("card.buffed")}</li>}
                    </ul>
                  )}
                  {!inspected.card.playable && <p className="text-amber-500">{t("card.unsupported")}</p>}
                  {inspected.playable && inspected.obj && dropKeysOf(inspected.obj.id).length > 0 && (
                    <PlayWhere
                      keys={dropKeysOf(inspected.obj.id)}
                      hint={hintOf(inspected.obj.id)}
                      view={view}
                      cardOf={cardOf}
                      domains={inspected.card.domains}
                      onPlay={() => {
                        const id = inspected.obj?.id;
                        setInspected(null);
                        if (id !== undefined) playButton(id);
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={trashOf !== null} onOpenChange={(open) => !open && setTrashOf(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {trashOf !== null ? t("zone.trashOf", { name: view.players[trashOf].name }) : ""}
              </DialogTitle>
              <DialogDescription>{t("zone.trashHint")}</DialogDescription>
            </DialogHeader>
            {trashOf !== null && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-row flex-wrap gap-2">
                  {view.players[trashOf].trash.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("zone.empty")}</p>
                  )}
                  {view.players[trashOf].trash.map((obj) => (
                    <PlayCard
                      key={obj.id}
                      obj={obj}
                      card={cardOf(obj)}
                      size="md"
                      onInspect={() => setInspected({ obj, card: cardOf(obj) })}
                    />
                  ))}
                </div>
                {view.players[trashOf].banish.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-medium">{t("zone.banish")}</h4>
                    <div className="flex flex-row flex-wrap gap-2">
                      {view.players[trashOf].banish.map((obj) => (
                        <PlayCard
                          key={obj.id}
                          obj={obj}
                          card={cardOf(obj)}
                          size="md"
                          onInspect={() => setInspected({ obj, card: cardOf(obj) })}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function buttonVariant(type: string): "default" | "outline" | "secondary" {
  if (type === "pass" || type === "end_turn" || type === "done" || type === "yes") return "default";
  if (type === "no" || type === "cancel") return "outline";
  return "secondary";
}

function Concede({ onConcede }: { onConcede: () => void }) {
  const t = useTranslations("Games.Play");
  const [asking, setAsking] = useState(false);
  return (
    <div className="flex flex-row flex-wrap items-center gap-2">
      {asking ? (
        <>
          <span className="text-sm">{t("concede.confirm")}</span>
          <Button variant="destructive" size="sm" onClick={onConcede}>
            {t("concede.yes")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAsking(false)}>
            {t("concede.no")}
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAsking(true)}>
          <Flag aria-hidden />
          {t("concede.action")}
        </Button>
      )}
    </div>
  );
}

/** Au-delà de ce nombre, les choix défilent et se filtrent (nommer une carte ou un tag). */
const MANY_CHOICES = 12;

function ChoiceButtons({ choices, onAct }: { choices: EngineChoice[]; onAct: (action: EngineAction) => void }) {
  const t = useTranslations("Games.Play");
  const [filter, setFilter] = useState("");
  const many = choices.length > MANY_CHOICES;
  const needle = filter.trim().toLocaleLowerCase();
  const shown = many && needle ? choices.filter((choice) => choice.label.toLocaleLowerCase().includes(needle)) : choices;

  return (
    <div className="flex flex-col gap-2">
      {many && (
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t("choices.filter")}
          aria-label={t("choices.filter")}
          className="h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
        />
      )}
      <div className={cn("flex flex-row flex-wrap gap-2", many && "max-h-64 overflow-y-auto pr-1")}>
        {shown.map((choice, index) => (
          <Button
            key={index}
            variant={buttonVariant(choice.action.type)}
            className="h-auto min-h-9 max-w-full whitespace-normal text-left"
            onClick={() => onAct(choice.action)}
          >
            {choice.label}
          </Button>
        ))}
        {shown.length === 0 && <p className="text-sm text-muted-foreground">{t("choices.none")}</p>}
      </div>
    </div>
  );
}

type PlayerBandProps = {
  /** Sur une ligne (les adversaires au-dessus du plateau) ou en carte (téléphone, et vous). */
  row?: boolean;
  player: EnginePlayer;
  view: EngineView;
  isMe: boolean;
  away: boolean;
  choices: EngineChoice[];
  onAct: (action: EngineAction) => void;
  onTrash: () => void;
  /** Fait l'action que la table raconte. */
  acting?: boolean;
  /** Marque des points dans l'évènement raconté. */
  scoring?: boolean;
  /** Sa couleur, celle de son nom dans le journal. */
  color?: string;
  /** Le nom de sa légende, sous le sien. */
  legendName: string;
  legend: ReactNode;
  /** Les légendes ajoutées en cours de partie (Neeko). */
  addedLegends?: ReactNode[];
  champion: ReactNode;
};

/**
 * Le bandeau d'un joueur : qui il est, son score en grand, puis ses compteurs.
 * Les adversaires l'ont au-dessus du plateau, vous à côté de votre main.
 */
function PlayerBand({
  row = false,
  player,
  view,
  isMe,
  away,
  choices,
  onAct,
  onTrash,
  acting = false,
  scoring = false,
  color,
  legendName,
  legend,
  addedLegends,
  champion,
}: PlayerBandProps) {
  const t = useTranslations("Games.Play");
  const turn = view.turn_seat === player.seat;
  const deciding = view.pending?.seat === player.seat && !view.result;
  const max = view.victory_score;
  const runes = player.runes_ready + player.runes_exhausted;
  const power = DOMAINS.map((domain, index) => ({ domain, amount: player.pool.power[index] ?? 0 })).filter(
    (entry) => entry.amount > 0,
  );

  const score = (
    <p
      className="shrink-0 text-xl font-extrabold leading-none tabular-nums"
      aria-label={t("player.points", { points: player.points, max })}
    >
      {player.points}
      <span className="text-sm font-semibold text-muted-foreground"> / {max}</span>
    </p>
  );
  const track = (
    <div aria-hidden className={cn("flex gap-0.5", !row && "w-full")}>
      {Array.from({ length: max }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 rounded-full bg-border transition-transform duration-300",
            row ? "w-4" : "flex-1",
            scoring && index === player.points - 1 && "scale-y-[2.2]",
          )}
          style={index < player.points ? { background: color } : undefined}
        />
      ))}
    </div>
  );
  const chip = cn(
    "inline-flex items-center rounded-md bg-secondary/70 text-xs text-muted-foreground",
    row ? "h-7 gap-1.5 px-2" : "h-6 gap-1 px-1.5",
  );
  const counter = (Icon: LucideIcon, label: string, value: ReactNode, narrow = true) => (
    <span className={cn(chip, !narrow && "max-sm:hidden")} title={label}>
      <Icon className="size-3.5" aria-hidden />
      <span className={cn(!row && "sr-only")}>{label}</span>
      <b className="font-semibold text-foreground">{value}</b>
    </span>
  );

  return (
    <section
      aria-label={player.name}
      className={cn(
        "flex min-w-0 gap-2 rounded-xl border bg-card transition-shadow duration-300",
        row ? "flex-row flex-wrap items-center gap-x-4 px-3 py-2" : "flex-col p-2.5",
        turn && "border-primary/60",
        acting && "play-focus",
        !player.alive && "opacity-50",
        choices.length > 0 && "ring-2 ring-primary",
      )}
    >
      <div className={cn("flex min-w-0 items-center gap-2", row && "min-w-48")}>
        <div className="flex shrink-0 gap-1">
          {legend}
          {champion}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            <span style={{ color }}>{player.name}</span>
            {isMe && <span className="font-normal text-muted-foreground"> · {t("player.you")}</span>}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {away ? (
              <span className="text-amber-500">{t("player.away")}</span>
            ) : turn ? (
              <span className="font-medium text-primary">{t("player.turn")}</span>
            ) : deciding ? (
              t("player.deciding")
            ) : (
              legendName
            )}
          </p>
        </div>
        {!row && score}
      </div>

      {row ? (
        <div className="flex items-center gap-2.5">
          {score}
          {track}
        </div>
      ) : (
        track
      )}

      {addedLegends && addedLegends.length > 0 && <div className="flex flex-row flex-wrap gap-1">{addedLegends}</div>}

      <div className={cn("flex flex-row flex-wrap items-center gap-1", row && "ml-auto")}>
        {counter(Hand, t("player.hand"), player.hand_count)}
        {counter(Library, t("player.deck"), player.deck_count, false)}
        {counter(Gem, t("player.runes"), `${player.runes_ready}/${runes}`)}
        <button
          type="button"
          onClick={onTrash}
          title={t("player.trash", { count: player.trash.length })}
          className={cn(chip, "hover:bg-secondary hover:text-foreground")}
        >
          <Trash2 className="size-3.5" aria-hidden />
          <span className={cn(!row && "sr-only")}>{t("player.trashLabel")}</span>
          <b className="font-semibold text-foreground">{player.trash.length}</b>
        </button>
        {player.pool.energy > 0 && <Badge variant="secondary">{t("player.energy", { count: player.pool.energy })}</Badge>}
        {power.map((entry) => (
          <Badge key={entry.domain} variant="secondary" className="gap-1">
            <span aria-hidden className={cn("size-2 rounded-full", DOMAIN_COLOR[entry.domain])} />
            {entry.amount} {t(`domain.${entry.domain}`)}
          </Badge>
        ))}
        {choices.map((choice, index) => (
          <Button key={index} size="sm" className="h-7 px-2 text-xs" onClick={() => onAct(choice.action)}>
            {choice.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

function dropClass(drop: DropState | undefined): string | false {
  if (!drop?.state) return false;
  if (drop.state === "off") return "opacity-40 transition-opacity";
  return cn(
    "ring-2 ring-primary transition",
    drop.state === "hot" ? "bg-primary/25 shadow-[0_0_34px_var(--primary)]" : "bg-primary/10 shadow-[0_0_24px_color-mix(in_oklab,var(--primary)_40%,transparent)]",
  );
}

/** Un emplacement permis, en attente d'un clic (après le bouton Jouer). */
function DropPick({ drop, label }: { drop: DropState | undefined; label: string }) {
  const t = useTranslations("Games.Play");
  if (!drop?.onPick || drop.state !== "ok") return null;
  return (
    <button
      type="button"
      className="absolute inset-0 z-20 cursor-pointer rounded-xl"
      aria-label={t("hand.playAt", { place: label })}
      onClick={(event) => drop.onPick?.(event)}
    >
      <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
        {t("hand.here")}
      </span>
    </button>
  );
}

/** Dans l'aperçu d'une carte jouable : où elle peut aller, son coût, et le bouton Jouer. */
function PlayWhere({
  keys,
  hint,
  view,
  cardOf,
  domains,
  onPlay,
}: {
  keys: string[];
  hint: EnginePlayHint | undefined;
  view: EngineView;
  cardOf: (obj: EngineObj | undefined | null) => TableCard | undefined;
  domains: string[];
  onPlay: () => void;
}) {
  const t = useTranslations("Games.Play");
  const place = (key: string) => {
    const loc = keyLoc(key);
    if (!loc) return "";
    if ("Base" in loc) return t("hand.base");
    const bf = view.battlefields[loc.Bf];
    return (bf && cardOf(bf.card)?.name) ?? t("hand.battlefield", { n: loc.Bf + 1 });
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background/60 p-2">
      {hint && (
        <p className="flex items-center gap-2">
          {t("hand.cost")} <CostChips cost={hint.cost} domains={domains} />
        </p>
      )}
      <p className="text-muted-foreground">
        {keys.includes("any") ? t("hand.whereSpell") : t("hand.whereList", { places: keys.map(place).join(" · ") })}
      </p>
      <Button className="self-start" onClick={onPlay}>
        {t("hand.play")}
      </Button>
    </div>
  );
}

type BaseStripProps = {
  /** Pendant qu'on joue une carte : l'emplacement est-il permis, survolé, ou éteint ? */
  drop?: DropState;
  title: string;
  choices: EngineChoice[];
  onAct: (action: EngineAction) => void;
  mine?: boolean;
  /** Sur la table en relief : un cartouche gravé dans le feutre. */
  relief?: boolean;
  children: ReactNode;
};

function BaseStrip({ title, choices, onAct, mine = false, relief = false, drop, children }: BaseStripProps) {
  return (
    <section
      data-drop={drop?.key}
      className={cn(
        "relative rounded-xl border p-3",
        relief ? "play-zone" : "bg-card",
        choices.length > 0 && "ring-2 ring-primary",
        dropClass(drop),
      )}
      aria-label={title}
    >
      <DropPick drop={drop} label={title} />
      <div className="mb-2 flex flex-row flex-wrap items-center justify-between gap-2">
        <h3
          className={cn(
            "text-xs uppercase tracking-wide",
            relief ? "play-engrave" : "font-medium text-muted-foreground",
          )}
        >
          {title}
        </h3>
        {choices.map((choice, index) => (
          <Button key={index} size="sm" className="h-7 px-2 text-xs" onClick={() => onAct(choice.action)}>
            {choice.label}
          </Button>
        ))}
      </div>
      <div className={cn("flex flex-row flex-wrap items-end gap-2", mine ? "min-h-24" : "min-h-16")}>{children}</div>
    </section>
  );
}

type RunesProps = {
  objs: EngineObj[];
  cards: TableCards;
  choicesOn: (key: string) => EngineChoice[];
  onAct: (action: EngineAction) => void;
  /** Ce que le paiement fait de chaque rune : É épuisée, R recyclée. */
  marks?: Record<number, RuneUse>;
  /** Paiement personnalisé : un clic change l'usage de la rune. */
  onRune?: (id: number) => void;
};

/** Les runes d'une base : une pastille par rune, à la couleur de son domaine. */
function Runes({ objs, cards, choicesOn, onAct, marks = {}, onRune }: RunesProps) {
  const t = useTranslations("Games.Play");
  if (objs.length === 0) return null;
  const ready = objs.filter((obj) => !obj.exhausted).length;
  const byDomain = new Map<string, number>();
  for (const obj of objs) {
    const domain = (obj.code ? cards[obj.code]?.domains[0]?.toLowerCase() : undefined) ?? "";
    if (domain) byDomain.set(domain, (byDomain.get(domain) ?? 0) + 1);
  }
  return (
    <div className="ml-auto flex max-w-full flex-col items-end gap-1 self-center">
    <div className="flex max-w-full flex-row flex-wrap justify-end gap-1" aria-label={t("player.runes")}>
      {objs.map((obj) => {
        const card = obj.code ? cards[obj.code] : undefined;
        const domain = card?.domains[0]?.toLowerCase() ?? "";
        const choices = choicesOn(`obj:${obj.id}`);
        const title = `${card?.name ?? t("player.runes")}${obj.exhausted ? ` · ${t("card.exhausted")}` : ""}`;
        const mark = marks[obj.id] && marks[obj.id] !== "none" ? marks[obj.id] : null;
        const dot = (
          <span className="relative block">
            <span
              className={cn(
                "block size-5 rounded-full border-2 border-background lg:size-6",
                DOMAIN_COLOR[domain] ?? "bg-muted-foreground",
                obj.exhausted && "opacity-30",
                (choices.length > 0 || onRune) && "ring-2 ring-primary/60",
                mark === "exhaust" && "ring-[3px] ring-primary",
                mark === "recycle" && "ring-[3px] ring-amber-400",
                mark === "both" && "ring-[3px] ring-primary outline outline-[3px] outline-offset-2 outline-amber-400",
              )}
            />
            {mark && mark !== "none" && (
              <span
                className={cn(
                  "absolute -right-2 -top-2.5 rounded-full border bg-card px-1 text-[0.55rem] font-extrabold leading-3.5",
                  mark === "recycle" ? "text-amber-400" : "text-primary",
                )}
              >
                {RUNE_MARK[mark]}
              </span>
            )}
          </span>
        );
        if (onRune) {
          return (
            <button
              key={obj.id}
              type="button"
              title={`${title}${mark && mark !== "none" ? ` · ${t(`payment.mark.${mark}`)}` : ""}`}
              aria-label={`${title}${mark && mark !== "none" ? ` · ${t(`payment.mark.${mark}`)}` : ""}`}
              onClick={() => onRune(obj.id)}
              className="cursor-pointer transition hover:-translate-y-0.5"
            >
              {dot}
            </button>
          );
        }
        return choices.length > 0 ? (
          <button
            key={obj.id}
            type="button"
            title={choices.map((choice) => choice.label).join(" / ")}
            onClick={() => onAct(choices[0].action)}
          >
            {dot}
          </button>
        ) : (
          <span key={obj.id} title={title}>
            {dot}
          </span>
        );
      })}
    </div>
      <p className="text-right text-xs text-muted-foreground">
        {t("player.runes")} :{" "}
        <b className="font-semibold text-foreground">{t("player.runesReady", { ready, total: objs.length })}</b>
        {[...byDomain].map(([domain, count]) => (
          <span key={domain} style={{ color: DOMAIN_HEX[domain] }}>
            {" · "}
            {count} {t(`domain.${domain}`)}
          </span>
        ))}
      </p>
    </div>
  );
}

type BattlefieldColumnProps = {
  bf: EngineBattlefield;
  view: EngineView;
  me: number;
  showdown: boolean;
  /** Concerné par l'évènement raconté. */
  focus: boolean;
  /** Unités mortes à l'instant, encore dessinées. */
  ghosts: Ghost[];
  renderGhost: (ghost: Ghost) => ReactNode;
  choices: EngineChoice[];
  onAct: (action: EngineAction) => void;
  card: ReactNode;
  renderObj: (obj: EngineObj, size?: CardSize) => ReactNode;
  /** Sur la table en relief : le contrôle se lit au fanion. */
  relief?: boolean;
  /** La couleur d'un joueur, pour le fanion de celui qui contrôle. */
  colorOf?: (seat: number) => string;
  drop?: DropState;
};

function BattlefieldColumn({
  bf,
  view,
  me,
  showdown,
  focus,
  ghosts,
  renderGhost,
  choices,
  onAct,
  card,
  renderObj,
  relief = false,
  colorOf,
  drop,
}: BattlefieldColumnProps) {
  const t = useTranslations("Games.Play");
  const mineHere = bf.units.filter((obj) => obj.controller === me);
  const ghostsOf = (seat: number) => ghosts.filter((ghost) => ghost.obj.controller === seat);
  const theirs = view.players
    .filter((player) => player.seat !== me)
    .map((player) => ({
      player,
      units: bf.units.filter((obj) => obj.controller === player.seat),
      ghosts: ghostsOf(player.seat),
    }))
    .filter((group) => group.units.length + group.ghosts.length > 0);
  const several = view.players.length > 2;

  const status =
    bf.contested_by !== null
      ? t("bf.contested", { name: view.players[bf.contested_by].name })
      : bf.controller !== null
        ? t("bf.controlled", { name: view.players[bf.controller].name })
        : t("bf.free");

  const control =
    bf.contested_by !== null ? "contested" : bf.controller === null ? "free" : bf.controller === me ? "me" : "other";
  return (
    <section
      data-bf={bf.index}
      data-drop={drop?.key}
      aria-label={status}
      className={cn(
        "relative flex min-w-0 flex-col items-center gap-2 rounded-xl border p-2 transition-colors duration-300 sm:p-3",
        relief ? "play-zone" : "bg-card",
        showdown && "border-amber-500",
        focus && "border-amber-400",
        choices.length > 0 && "ring-2 ring-primary",
        dropClass(drop),
      )}
    >
      <DropPick drop={drop} label={status} />
      {relief && (
        <span
          className="play-pennant self-start"
          data-control={control}
          style={
            control !== "contested" && bf.controller !== null && colorOf
              ? ({ "--pennant": colorOf(bf.controller) } as CSSProperties)
              : undefined
          }
        >
          {status}
        </span>
      )}
      <div className="flex min-h-8 w-full flex-col items-center justify-end gap-1">
        {theirs.map((group) => (
          <div key={group.player.seat} className="flex w-full flex-col items-center gap-1">
            {several && <span className="text-[0.65rem] text-muted-foreground">{group.player.name}</span>}
            <div className="flex flex-row flex-wrap justify-center gap-1.5">
              {group.units.map((obj) => renderObj(obj, "md"))}
              {group.ghosts.map((ghost) => renderGhost(ghost))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-1">
        {card}
        <div className="flex flex-row flex-wrap justify-center gap-1">
          {!relief && (
            <Badge
              variant={bf.controller === me ? "default" : "secondary"}
              className={cn(bf.contested_by !== null && "bg-amber-500 text-black")}
            >
              {status}
            </Badge>
          )}
          {showdown && <Badge variant="outline">{t("bf.showdown")}</Badge>}
        </div>
        {bf.facedown.length > 0 && (
          <div className="flex flex-row flex-wrap justify-center gap-1">
            {bf.facedown.map((obj) => renderObj(obj, "xs"))}
          </div>
        )}
        {choices.map((choice, index) => (
          <Button
            key={index}
            size="sm"
            className="h-auto min-h-7 max-w-full whitespace-normal px-2 text-xs"
            onClick={() => onAct(choice.action)}
          >
            {choice.label}
          </Button>
        ))}
      </div>

      <div className="flex min-h-8 w-full flex-row flex-wrap items-start justify-center gap-1.5">
        {mineHere.map((obj) => renderObj(obj, "md"))}
        {ghostsOf(me).map((ghost) => renderGhost(ghost))}
      </div>
    </section>
  );
}

/** Le signe d'une ligne du journal : ce que fait l'action, d'un coup d'œil. */
const EVENT_ICON: Record<string, LucideIcon> = {
  played: Play,
  activated: Zap,
  drew: Plus,
  paid: Coins,
  channeled: Gem,
  died: Skull,
  banished: Skull,
  control_changed: Flag,
  contested: Flag,
  scored: Star,
  points: Star,
  combat_started: Swords,
  combat_damage: Swords,
  damaged: Swords,
  moved: MoveRight,
};

type JournalTurn = { start: number; title: string | null; seat: number | null; items: { entry: EngineTold; index: number }[] };

/** Le journal découpé par tour : chaque début de tour ouvre un groupe et lui donne son titre. */
function byTurn(entries: EngineTold[]): JournalTurn[] {
  const turns: JournalTurn[] = [];
  entries.forEach((entry, index) => {
    if (eventType(entry) === "turn_started") {
      turns.push({ start: index, title: plain(entry.text), seat: actorOf(entry), items: [] });
      return;
    }
    if (turns.length === 0) turns.push({ start: index, title: null, seat: null, items: [] });
    turns[turns.length - 1].items.push({ entry, index });
  });
  return turns;
}

/** Le récit de la partie, tour par tour. Le numéro de la règle n'apparaît qu'au survol d'une ligne. */
function Journal({
  entries,
  told,
  colorOf,
}: {
  entries: EngineTold[];
  told: (text: string) => ReactNode;
  colorOf: (seat: number) => string;
}) {
  const t = useTranslations("Games.Play");
  const list = useRef<HTMLDivElement>(null);
  const [scope, setScope] = useState<"all" | "turn">("all");
  const turns = useMemo(() => byTurn(entries), [entries]);
  const shown = scope === "turn" ? turns.slice(-1) : turns;

  useEffect(() => {
    const container = list.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [entries.length, scope]);

  return (
    <section className="flex min-h-0 flex-col rounded-xl border bg-card lg:flex-1">
      <div className="flex flex-row flex-wrap items-center gap-2 px-4 pb-2 pt-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="size-4" aria-hidden />
          {t("journal.title")}
        </h3>
        <div className="ml-auto flex flex-row flex-wrap rounded-md bg-secondary/70 p-0.5" role="group" aria-label={t("journal.title")}>
          {(["turn", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
              className={cn(
                "h-6 rounded px-2 text-xs text-muted-foreground",
                scope === value && "bg-background text-foreground shadow-sm",
              )}
            >
              {t(value === "turn" ? "journal.thisTurn" : "journal.all")}
            </button>
          ))}
        </div>
      </div>
      <div ref={list} className="flex max-h-80 min-h-24 flex-col gap-3 overflow-y-auto px-3 pb-3 text-sm lg:max-h-none lg:flex-1">
        {entries.length === 0 && <p className="px-1 text-muted-foreground">{t("journal.empty")}</p>}
        {shown.map((turn) => (
          <section key={turn.start} className="flex flex-col">
            <h4 className="sticky top-0 z-[1] mb-1 flex items-center gap-2 border-b bg-card px-1 pb-1.5 pt-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-muted-foreground"
                style={turn.seat !== null ? { background: colorOf(turn.seat) } : undefined}
              />
              {turn.title ?? t("journal.setup")}
            </h4>
            <ol className="flex flex-col">
              {turn.items.map(({ entry, index }) => {
                const Icon = EVENT_ICON[eventType(entry)] ?? Circle;
                const sub = entry.text?.startsWith(" ");
                return (
                  <li
                    key={index}
                    className={cn(
                      "group flex items-start gap-2 rounded-md px-1 py-0.5 leading-snug hover:bg-secondary/50",
                      sub && "pl-6 text-muted-foreground",
                    )}
                  >
                    <Icon
                      aria-hidden
                      className={cn("mt-0.5 shrink-0 text-muted-foreground", Icon === Circle ? "size-1.5 translate-y-1 fill-current" : "size-3.5")}
                    />
                    <span className="min-w-0 flex-1">{told(entry.text?.trim() ?? "")}</span>
                    {entry.rule && (
                      <Link
                        href={`/games/riftbound/rules/cr#rule-${entry.rule}`}
                        target="_blank"
                        rel="noreferrer"
                        title={t("journal.rule", { rule: entry.rule })}
                        className="shrink-0 pt-0.5 font-mono text-[0.65rem] text-muted-foreground opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60"
                      >
                        {entry.rule}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </section>
  );
}

/** Une ligne du journal sans ses tirets de mise en forme (« — Tour 4 : Robot — »). */
function plain(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/^—\s*|\s*—$/g, "");
}

/**
 * La barre de la table, à la place de l'en-tête du site : quitter, le tour en
 * cours, l'évènement raconté et le réglage du rythme.
 */
function TableBar({
  paced,
  view,
  told,
  colorOf,
  note,
  watching = false,
}: {
  paced: PacedFeed;
  view: EngineView;
  told: (text: string) => ReactNode;
  colorOf: (seat: number) => string;
  note?: ReactNode;
  /** Partie entre IA : boutons de pause et de pas à pas. */
  watching?: boolean;
}) {
  const t = useTranslations("Games.Play");
  const turnPlayer = view.players[view.turn_seat];
  return (
    <header
      data-play-bar
      className="sticky top-0 z-30 flex flex-row flex-wrap items-center gap-x-2 gap-y-1.5 border-b bg-background/95 px-2 py-1.5 backdrop-blur lg:flex-nowrap lg:gap-3 lg:px-4"
    >
      <Button variant="outline" size="sm" asChild>
        <Link href="/games/riftbound/play" aria-label={t("table.quit")}>
          <ArrowLeft aria-hidden />
          <span className="max-lg:hidden">{t("table.quit")}</span>
        </Link>
      </Button>
      <div className="hidden shrink-0 flex-col leading-tight xl:flex">
        <span className="text-sm font-bold">Riftbound</span>
        {note && <span className="text-[0.7rem] text-muted-foreground">{note}</span>}
      </div>
      {turnPlayer && (
        <p className="flex shrink-0 items-center gap-1.5 rounded-full border bg-secondary/60 px-3 py-1 text-xs sm:text-sm">
          <span className="font-semibold">{t("table.turn", { turn: view.turn })}</span>
          <span aria-hidden className="size-2 rounded-full" style={{ background: colorOf(view.turn_seat) }} />
          <span className="font-medium" style={{ color: colorOf(view.turn_seat) }}>
            {turnPlayer.name}
          </span>
        </p>
      )}
      <Narration paced={paced} told={told} className="max-lg:order-last max-lg:basis-full lg:flex-1" />
      <div className="ml-auto flex flex-row flex-wrap items-center gap-1 lg:ml-0">
        {watching && !view.result && (
          <>
            <Button
              size="sm"
              variant={paced.paused ? "default" : "secondary"}
              className="h-8 px-2.5 text-xs"
              aria-pressed={paced.paused}
              onClick={() => paced.setPaused(!paced.paused)}
            >
              {paced.paused ? <Play aria-hidden /> : <Pause aria-hidden />}
              {paced.paused ? t("watch.resume") : t("watch.pause")}
              <kbd className="rounded border border-current px-1 font-mono text-[0.6rem] opacity-70 max-sm:hidden">
                {t("pace.key")}
              </kbd>
            </Button>
            {paced.paused && (
              <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={paced.step}>
                <SkipForward aria-hidden />
                <span className="max-sm:sr-only">{t("watch.step")}</span>
              </Button>
            )}
          </>
        )}
        {paced.busy && !(watching && paced.paused) && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={paced.skip}>
            <FastForward aria-hidden />
            <span className="max-sm:sr-only">{t("pace.skip")}</span>
          </Button>
        )}
        <PaceSettings paced={paced} watching={watching} />
      </div>
    </header>
  );
}

/** Le récit : l'évènement au premier plan et ce qui reste à raconter. */
function Narration({
  paced,
  told,
  className,
}: {
  paced: PacedFeed;
  told: (text: string) => ReactNode;
  className?: string;
}) {
  const t = useTranslations("Games.Play");
  const step = paced.current;
  const shown = step?.entry ?? paced.journal.at(-1);

  return (
    <div
      aria-live="polite"
      className={cn("flex min-w-0 flex-row items-center gap-2 rounded-lg border bg-secondary/50 px-3 py-1.5", className)}
    >
      <p
        key={step?.index ?? "idle"}
        className={cn("animate-fade-in line-clamp-2 min-w-0 flex-1 text-sm leading-snug", !step && "text-muted-foreground")}
      >
        {shown?.text ? told(shown.text.trim()) : t("journal.empty")}
      </p>
      {paced.remaining > 0 && (
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{t("pace.remaining", { count: paced.remaining })}</span>
      )}
      {step && !paced.ack && step.ms > 0 && (
        <span aria-hidden className="h-1 w-12 shrink-0 overflow-hidden rounded bg-border">
          <span
            key={step.index}
            className="play-progress block h-full bg-primary"
            style={{ animationDuration: `${step.ms}ms` }}
          />
        </span>
      )}
    </div>
  );
}

/** La main d'un joueur vue par un spectateur d'une partie entre IA (vue d'arbitre). */
function SeenHand({ player, renderObj }: { player: EnginePlayer; renderObj: (obj: EngineObj, size?: CardSize) => ReactNode }) {
  const t = useTranslations("Games.Play");
  if (!player.hand || player.hand.length === 0) return null;
  return (
    <div className="flex w-full flex-col gap-1 border-t border-dashed pt-2">
      <span className="flex items-center gap-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        <Eye className="size-3" aria-hidden />
        {t("watch.handOf", { name: player.name })} · {player.hand.length}
      </span>
      <div className="flex flex-row flex-wrap gap-1.5">{player.hand.map((obj) => renderObj(obj, "sm"))}</div>
    </div>
  );
}

/** Le panneau d'une partie entre IA : où en est la partie, pause, mains visibles. */
function WatchPanel({
  paced,
  hands,
  onHands,
  turn,
}: {
  paced: PacedFeed;
  hands: boolean;
  onHands: (hands: boolean) => void;
  turn: number;
}) {
  const t = useTranslations("Games.Play");
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{t("watch.title")}</h2>
      <p className="text-sm text-muted-foreground">{paced.paused ? t("watch.pausedHint", { turn }) : t("watch.playingHint")}</p>
      <div className="flex flex-row flex-wrap gap-2">
        <Button onClick={() => paced.setPaused(!paced.paused)}>
          {paced.paused ? <Play aria-hidden /> : <Pause aria-hidden />}
          {paced.paused ? t("watch.resumeLong") : t("watch.pauseLong")}
        </Button>
        {paced.paused && (
          <Button variant="outline" onClick={paced.step}>
            <SkipForward aria-hidden />
            {t("watch.step")}
          </Button>
        )}
      </div>
      <label className="flex items-center gap-2 border-t pt-3 text-sm">
        <input
          type="checkbox"
          className="accent-[var(--primary)]"
          checked={hands}
          onChange={(event) => onHands(event.target.checked)}
        />
        {t("watch.hands")}
      </label>
    </div>
  );
}

function PaceSettings({ paced, watching = false }: { paced: PacedFeed; watching?: boolean }) {
  const t = useTranslations("Games.Play");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" title={t("pace.settings")}>
          <Gauge aria-hidden />
          <span className="max-sm:sr-only">{t(`pace.speed.${paced.pace.speed}`)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-3 p-3">
        <p className="text-sm font-medium">{t("pace.settings")}</p>
        <div className="flex flex-row flex-wrap gap-1" role="group" aria-label={t("pace.settings")}>
          {PACE_SPEEDS.map((speed) => (
            <Button
              key={speed}
              size="sm"
              variant={paced.pace.speed === speed ? "default" : "outline"}
              aria-pressed={paced.pace.speed === speed}
              className="h-7 px-2 text-xs"
              onClick={() => paced.setPace({ ...paced.pace, speed })}
            >
              {t(`pace.speed.${speed}`)}
            </Button>
          ))}
        </div>
        {watching ? (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--primary)]"
              checked={paced.pace.watchStops}
              onChange={(event) => paced.setPace({ ...paced.pace, watchStops: event.target.checked })}
            />
            <span>
              {t("watch.stops")}
              <span className="block text-xs text-muted-foreground">{t("watch.stopsHint")}</span>
            </span>
          </label>
        ) : (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--primary)]"
              checked={paced.pace.stops}
              onChange={(event) => paced.setPace({ ...paced.pace, stops: event.target.checked })}
            />
            <span>
              {t("pace.stops")}
              <span className="block text-xs text-muted-foreground">{t("pace.stopsHint")}</span>
            </span>
          </label>
        )}
        <p className="text-sm font-medium">{t("pace.view")}</p>
        <div className="flex flex-row flex-wrap gap-1" role="group" aria-label={t("pace.view")}>
          {TABLE_VIEWS.map((view) => (
            <Button
              key={view}
              size="sm"
              variant={paced.pace.view === view ? "default" : "outline"}
              aria-pressed={paced.pace.view === view}
              className="h-7 px-2 text-xs"
              onClick={() => paced.setPace({ ...paced.pace, view })}
            >
              {t(`pace.views.${view}`)}
            </Button>
          ))}
        </div>
        <label className={cn("flex items-start gap-2 text-sm", paced.pace.view !== "3d" && "opacity-50")}>
          <input
            type="checkbox"
            className="mt-0.5 accent-[var(--primary)]"
            checked={paced.pace.camera}
            disabled={paced.pace.view !== "3d"}
            onChange={(event) => paced.setPace({ ...paced.pace, camera: event.target.checked })}
          />
          <span>
            {t("pace.camera")}
            <span className="block text-xs text-muted-foreground">{t("pace.cameraHint")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 accent-[var(--primary)]"
            checked={paced.pace.effects}
            onChange={(event) => paced.setPace({ ...paced.pace, effects: event.target.checked })}
          />
          <span>
            {t("pace.effects")}
            <span className="block text-xs text-muted-foreground">{t("pace.effectsHint")}</span>
          </span>
        </label>
        {!watching && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--primary)]"
              checked={paced.pace.autoPay}
              onChange={(event) => paced.setPace({ ...paced.pace, autoPay: event.target.checked })}
            />
            <span>
              {t("pace.autoPay")}
              <span className="block text-xs text-muted-foreground">{t("pace.autoPayHint")}</span>
            </span>
          </label>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Au centre de la table, le temps de l'évènement : la carte jouée par un adversaire, ou le nouveau tour. */
function StepOverlay({ paced, view, cards, me }: { paced: PacedFeed; view: EngineView; cards: TableCards; me: number | null }) {
  const step = paced.current;
  if (!step) return null;
  const type = eventType(step.entry);

  if (type === "turn_started") {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center px-4">
        <p
          key={step.index}
          className="play-banner rounded-xl border border-primary bg-card/95 px-6 py-2.5 text-lg font-semibold shadow-xl"
        >
          {plain(step.entry.text)}
        </p>
      </div>
    );
  }

  if (!revealsCard(step.entry, me)) return null;
  const event = step.entry.event;
  const id = typeof event.obj === "number" ? event.obj : typeof event.source === "number" ? event.source : null;
  const code = id !== null ? codeOf(view, id) : null;
  const card = code ? cards[code] : undefined;
  if (!card) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center px-4">
      <div
        key={step.index}
        className="play-enter flex max-w-xs flex-col items-center gap-2 rounded-xl border bg-background/90 p-3 text-center shadow-2xl backdrop-blur"
      >
        <span className="text-sm text-muted-foreground">{plain(step.entry.text)}</span>
        <PlayCard card={card} size="lg" />
      </div>
    </div>
  );
}

/** Un moment clé : la lecture attend « Continuer » (ou Espace, Entrée). */
function AckCard({
  ack,
  view,
  cards,
  onContinue,
  told,
}: {
  ack: Ack;
  view: EngineView;
  cards: TableCards;
  onContinue: () => void;
  told: (text: string) => ReactNode;
}) {
  const t = useTranslations("Games.Play");
  const code = ack.objId !== null ? codeOf(view, ack.objId) : null;
  const card = code ? cards[code] : undefined;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") return;
      // Un bouton ou un champ a le focus : c'est à lui de répondre.
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, input, textarea, select, a, [contenteditable]")) return;
      event.preventDefault();
      onContinue();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onContinue]);

  return (
    <div className="animate-fade-in flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {card && <PlayCard card={card} size="sm" />}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-snug">
            {ack.kind === "turn" ? t("pace.yourTurn") : told(plain(ack.title))}
          </h2>
          {card?.text && (
            <p className="mt-1 line-clamp-4 whitespace-pre-line text-xs text-muted-foreground">{card.text}</p>
          )}
          {ack.kind === "turn" && <p className="mt-1 text-sm text-muted-foreground">{t("pace.sinceLastTurn")}</p>}
          {ack.lines.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-sm text-muted-foreground">
              {ack.lines.map((line, index) => (
                <li key={index}>{told(line)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex flex-row flex-wrap items-center gap-2">
        <Button autoFocus onClick={onContinue}>
          {ack.kind === "turn" ? t("pace.play") : t("pace.continue")}
        </Button>
        <kbd className="rounded border px-1 font-mono text-[0.65rem] text-muted-foreground">{t("pace.key")}</kbd>
      </div>
    </div>
  );
}
