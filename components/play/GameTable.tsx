"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookOpen, Crown, FastForward, Flag, Gauge, Hourglass, Layers, Trash2, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

import { PlayCard } from "@/components/play/PlayCard";
import { HandFan, PointRails, TableScene } from "@/components/play/TableScene";
import type { GameFeed } from "@/components/play/game-feed";
import { usePacedFeed, type Ghost, type PacedFeed } from "@/components/play/usePacedFeed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mulliganChoice, mulliganLimit, sortChoices } from "@/lib/engine/anchors";
import type { TableCard, TableCards } from "@/lib/engine/cards";
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
  EngineObj,
  EnginePlayer,
  EngineTold,
  EngineView,
} from "@/lib/engine/types";
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

type Inspected = { obj?: EngineObj; card?: TableCard };

type GameTableProps = {
  feed: GameFeed;
  cards: TableCards;
  /** Ce qui suit le résultat : rejouer, revenir à l'accueil du jeu… */
  afterResult?: ReactNode;
};

/**
 * La table de jeu. Elle ne connaît aucune règle : elle dessine ce que le moteur
 * montre (`view`), pose la question qu'il pose (`prompt`) et lui renvoie, telle
 * quelle, l'une des actions qu'il propose.
 */
export function GameTable({ feed, cards, afterResult }: GameTableProps) {
  const t = useTranslations("Games.Play");
  // La partie racontée pas à pas : la vue et le journal suivent le récit, la
  // question n'apparaît qu'une fois le récit arrivé au présent.
  const paced = usePacedFeed(feed);
  const { update, journal } = paced;
  const hold = feed.hold;
  useEffect(() => {
    hold?.(paced.busy);
  }, [hold, paced.busy]);
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

  // La sélection du mulligan ne vaut que pour la question à laquelle elle répond.
  const promptKey = update ? `${update.seq}:${prompt?.text ?? ""}` : "";
  const mulligan = mulliganState.key === promptKey ? mulliganState.ids : [];

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
  const act = (action: EngineAction) => feed.act(action);
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

  const renderObj = (obj: EngineObj, size: "xs" | "sm" | "md" | "lg" = "md") => (
    <PlayCard
      key={obj.id}
      obj={obj}
      card={cardOf(obj)}
      size={size}
      choices={choicesOn(`obj:${obj.id}`)}
      onAct={act}
      onInspect={() => setInspected({ obj, card: cardOf(obj) })}
      dim={choosingOnTable}
      focus={focusObjs.has(obj.id)}
      hit={hits.get(obj.id)}
    />
  );

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
  const waitingFor = view.pending && view.pending.seat !== feed.seat ? view.players[view.pending.seat] : null;

  // En relief, la caméra s'approche du combat raconté ; jamais pendant qu'on choisit.
  const relief = paced.pace.view === "3d";
  const dive =
    relief && paced.pace.camera && paced.pace.speed !== "instant" && (paced.busy || paced.ack?.kind === "combat")
      ? // Entre deux évènements racontés, la caméra reste sur le dernier.
        combatInFocus(paced.journal, paced.current ?? { index: paced.journal.length - 1 }, paced.ack)
      : null;

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
      renderObj(obj, "lg")
    );
  const handItems = [
    ...(mine.champion && !spectator
      ? [
          {
            key: "champion",
            node: (
              <div className="flex flex-col items-center gap-1">
                {renderObj(mine.champion, "lg")}
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
        >
          {view.bases[player.seat].filter((obj) => !isRune(obj)).map((obj) => renderObj(obj, "sm"))}
          {ghostsAt("base", player.seat).map((ghost) => renderGhost(ghost, "sm"))}
          <Runes objs={view.bases[player.seat].filter(isRune)} cards={cards} choicesOn={choicesOn} onAct={act} />
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
            card={renderObj(bf.card, "md")}
            renderObj={renderObj}
            relief={relief}
          />
        ))}
      </div>

      <BaseStrip
        title={spectator ? t("zone.baseOf", { name: mine.name }) : t("zone.myBase")}
        choices={choicesOn(`base:${me}`)}
        onAct={act}
        mine
        relief={relief}
      >
        {view.bases[me].filter((obj) => !isRune(obj)).map((obj) => renderObj(obj, "md"))}
        {ghostsAt("base", me).map((ghost) => renderGhost(ghost))}
        <Runes objs={view.bases[me].filter(isRune)} cards={cards} choicesOn={choicesOn} onAct={act} />
      </BaseStrip>
    </>
  );

  return (
    <div className="flex flex-col gap-3 max-lg:pb-48 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_21rem] lg:items-start">
      {/* Joueurs */}
      <aside className="flex gap-2 overflow-x-auto lg:sticky lg:top-20 lg:flex-col lg:overflow-visible">
        {[...others, mine].map((player) => (
          <PlayerPanel
            key={player.seat}
            player={player}
            view={view}
            isMe={!spectator && player.seat === me}
            away={feed.away.includes(player.seat)}
            choices={choicesOn(`seat:${player.seat}`)}
            onAct={act}
            onTrash={() => setTrashOf(player.seat)}
            acting={actor === player.seat}
            scoring={scoring.includes(player.seat)}
            legend={renderObj(player.legend, "sm")}
            addedLegends={(player.added_legends ?? []).map((added) => renderObj(added, "sm"))}
            champion={player.champion && (spectator || player.seat !== me) ? renderObj(player.champion, "sm") : null}
          />
        ))}
      </aside>

      {/* Table */}
      <main className="relative flex min-w-0 flex-col gap-3">
        <Narration paced={paced} />
        <StepOverlay paced={paced} view={view} cards={cards} me={feed.seat} />

        {relief ? (
          <TableScene
            dive={dive}
            rails={
              <PointRails
                players={view.players}
                me={spectator ? null : me}
                max={view.victory_score}
                label={(player) =>
                  `${player.name} · ${t("player.points", { points: player.points, max: view.victory_score })}`
                }
              />
            }
            hand={
              spectator ? null : (
                <section aria-label={t("zone.hand")}>
                  {myHand.length === 0 && !mine.champion ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">{t("zone.emptyHand")}</p>
                  ) : (
                    <HandFan items={handItems} />
                  )}
                </section>
              )
            }
          >
            {board}
          </TableScene>
        ) : (
          <>
            {board}
            {!spectator && (
              <section aria-label={t("zone.hand")} className="rounded-xl border bg-card p-3">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("zone.hand")} · {myHand.length}
                </h3>
                <div className="flex items-end gap-2 overflow-x-auto px-1 pb-2 pt-2">
                  {mine.champion && (
                    <div className="flex shrink-0 flex-col items-center gap-1 border-r pr-3">
                      {renderObj(mine.champion, "lg")}
                      <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                        {t("zone.champion")}
                      </span>
                    </div>
                  )}
                  {myHand.length === 0 && <p className="py-6 text-sm text-muted-foreground">{t("zone.emptyHand")}</p>}
                  {myHand.map(handCard)}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Question, chaîne, journal */}
      <aside className="flex flex-col gap-3 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)]">
        <section
          aria-live="polite"
          data-play-sheet
          className="flex flex-col gap-3 rounded-xl border bg-card p-4 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:max-h-[45dvh] max-lg:overflow-y-auto max-lg:rounded-b-none max-lg:shadow-2xl"
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
            <AckCard ack={paced.ack} view={view} cards={cards} onContinue={paced.proceed} />
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

              {sorted.buttons.length > 0 && (
                <ChoiceButtons key={promptKey} choices={sorted.buttons} onAct={act} />
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

        <Journal entries={journal} />

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

type PlayerPanelProps = {
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
  legend: ReactNode;
  /** Les légendes ajoutées en cours de partie (Neeko), sur leur propre rangée. */
  addedLegends?: ReactNode[];
  champion: ReactNode;
};

function PlayerPanel({
  player,
  view,
  isMe,
  away,
  choices,
  onAct,
  onTrash,
  acting = false,
  scoring = false,
  legend,
  addedLegends,
  champion,
}: PlayerPanelProps) {
  const t = useTranslations("Games.Play");
  const turn = view.turn_seat === player.seat;
  const deciding = view.pending?.seat === player.seat && !view.result;
  const power = DOMAINS.map((domain, index) => ({ domain, amount: player.pool.power[index] ?? 0 })).filter(
    (entry) => entry.amount > 0,
  );

  return (
    <section
      className={cn(
        "flex min-w-56 shrink-0 flex-col gap-2 rounded-xl border bg-card p-3 transition-shadow duration-300 lg:min-w-0",
        turn && "border-primary/60",
        acting && "play-focus",
        !player.alive && "opacity-50",
        choices.length > 0 && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-start gap-2">
        {legend}
        {champion}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {player.name}
            {isMe && <span className="font-normal text-muted-foreground"> · {t("player.you")}</span>}
          </p>
          <div className="mt-1 flex flex-row flex-wrap gap-1">
            {turn && <Badge>{t("player.turn")}</Badge>}
            {deciding && !turn && <Badge variant="secondary">{t("player.deciding")}</Badge>}
            {away && (
              <Badge variant="outline" className="text-amber-500">
                {t("player.away")}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {addedLegends && addedLegends.length > 0 && <div className="flex flex-row flex-wrap gap-2">{addedLegends}</div>}

      <div aria-label={t("player.points", { points: player.points, max: view.victory_score })}>
        <div className="flex flex-row flex-wrap gap-1">
          {Array.from({ length: view.victory_score }, (_, index) => (
            <span
              key={index}
              aria-hidden
              className={cn(
                "size-2.5 rounded-full border transition-transform duration-300",
                index < player.points ? "border-primary bg-primary" : "",
                scoring && index === player.points - 1 && "scale-150 shadow-[0_0_10px_var(--primary)]",
              )}
            />
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("player.points", { points: player.points, max: view.victory_score })}
        </p>
      </div>

      <p className="text-xs text-muted-foreground lg:hidden">
        {t("player.hand")} {player.hand_count} · {t("player.deck")} {player.deck_count} · {t("player.runes")}{" "}
        {player.runes_ready}/{player.runes_ready + player.runes_exhausted}
      </p>
      <dl className="hidden grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-muted-foreground lg:grid">
        <dt>{t("player.hand")}</dt>
        <dd className="text-right text-foreground">{player.hand_count}</dd>
        <dt>{t("player.deck")}</dt>
        <dd className="text-right text-foreground">{player.deck_count}</dd>
        <dt>{t("player.runes")}</dt>
        <dd className="text-right text-foreground">
          {t("player.runesReady", { ready: player.runes_ready, total: player.runes_ready + player.runes_exhausted })}
        </dd>
        <dt>{t("player.runeDeck")}</dt>
        <dd className="text-right text-foreground">{player.rune_deck_count}</dd>
      </dl>

      {(player.pool.energy > 0 || power.length > 0) && (
        <div className="flex flex-row flex-wrap items-center gap-1 text-xs">
          <span className="text-muted-foreground">{t("player.pool")}</span>
          {player.pool.energy > 0 && <Badge variant="secondary">{t("player.energy", { count: player.pool.energy })}</Badge>}
          {power.map((entry) => (
            <Badge key={entry.domain} variant="secondary" className="gap-1">
              <span aria-hidden className={cn("size-2 rounded-full", DOMAIN_COLOR[entry.domain])} />
              {entry.amount} {t(`domain.${entry.domain}`)}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-row flex-wrap gap-2">
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onTrash}>
          <Trash2 aria-hidden />
          {t("player.trash", { count: player.trash.length })}
        </Button>
        {choices.map((choice, index) => (
          <Button key={index} size="sm" className="h-7 px-2 text-xs" onClick={() => onAct(choice.action)}>
            {choice.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

type BaseStripProps = {
  title: string;
  choices: EngineChoice[];
  onAct: (action: EngineAction) => void;
  mine?: boolean;
  /** Sur la table en relief : un cartouche gravé dans le feutre. */
  relief?: boolean;
  children: ReactNode;
};

function BaseStrip({ title, choices, onAct, mine = false, relief = false, children }: BaseStripProps) {
  return (
    <section
      className={cn(
        "rounded-xl border p-3",
        relief ? "play-zone" : "bg-card",
        choices.length > 0 && "ring-2 ring-primary",
      )}
      aria-label={title}
    >
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
};

/** Les runes d'une base : une pastille par rune, à la couleur de son domaine. */
function Runes({ objs, cards, choicesOn, onAct }: RunesProps) {
  const t = useTranslations("Games.Play");
  if (objs.length === 0) return null;
  return (
    <div className="ml-auto flex max-w-full flex-row flex-wrap items-center gap-1 self-center" aria-label={t("player.runes")}>
      {objs.map((obj) => {
        const card = obj.code ? cards[obj.code] : undefined;
        const domain = card?.domains[0]?.toLowerCase() ?? "";
        const choices = choicesOn(`obj:${obj.id}`);
        const title = `${card?.name ?? t("player.runes")}${obj.exhausted ? ` · ${t("card.exhausted")}` : ""}`;
        const dot = (
          <span
            className={cn(
              "block size-5 rounded-full border-2 border-background",
              DOMAIN_COLOR[domain] ?? "bg-muted-foreground",
              obj.exhausted && "opacity-30",
              choices.length > 0 && "ring-2 ring-primary",
            )}
          />
        );
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
  renderObj: (obj: EngineObj, size?: "xs" | "sm" | "md" | "lg") => ReactNode;
  /** Sur la table en relief : le contrôle se lit au fanion. */
  relief?: boolean;
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
      aria-label={status}
      className={cn(
        "relative flex min-w-0 flex-col items-center gap-2 rounded-xl border p-2 transition-colors duration-300 sm:p-3",
        relief ? "play-zone" : "bg-card",
        showdown && "border-amber-500",
        focus && "border-amber-400",
        choices.length > 0 && "ring-2 ring-primary",
      )}
    >
      {relief && (
        <span className="play-pennant self-start" data-control={control}>
          {status}
        </span>
      )}
      <div className="flex min-h-20 w-full flex-col items-center justify-end gap-1">
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

      <div className="flex min-h-20 w-full flex-row flex-wrap items-start justify-center gap-1.5">
        {mineHere.map((obj) => renderObj(obj, "md"))}
        {ghostsOf(me).map((ghost) => renderGhost(ghost))}
      </div>
    </section>
  );
}

/** Le récit de la partie. Chaque ligne cite sa règle ; le numéro ouvre la règle. */
function Journal({ entries }: { entries: EngineTold[] }) {
  const t = useTranslations("Games.Play");
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const container = list.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [entries.length]);

  return (
    <section className="flex min-h-0 flex-col rounded-xl border bg-card p-4 lg:flex-1">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <BookOpen className="size-4" aria-hidden />
        {t("journal.title")}
      </h3>
      <ol ref={list} className="flex max-h-72 min-h-24 flex-col gap-1 overflow-y-auto text-sm lg:max-h-none lg:flex-1">
        {entries.length === 0 && <li className="text-muted-foreground">{t("journal.empty")}</li>}
        {entries.map((entry, index) => (
          <li key={index} className={cn("leading-snug", entry.text?.startsWith(" ") && "pl-4 text-muted-foreground")}>
            {entry.text?.trim()}
            {entry.rule && (
              <Link
                href={`/games/riftbound/rules/cr#rule-${entry.rule}`}
                target="_blank"
                rel="noreferrer"
                title={t("journal.rule", { rule: entry.rule })}
                className="ml-1.5 inline-block rounded border px-1 text-[0.65rem] text-muted-foreground hover:border-primary hover:text-primary"
              >
                {entry.rule}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Une ligne du journal sans ses tirets de mise en forme (« — Tour 4 : Robot — »). */
function plain(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/^—\s*|\s*—$/g, "");
}

/** Le bandeau du récit : l'évènement au premier plan, ce qui reste, et le réglage du rythme. */
function Narration({ paced }: { paced: PacedFeed }) {
  const t = useTranslations("Games.Play");
  const step = paced.current;
  const shown = step?.entry ?? paced.journal.at(-1);

  return (
    <div
      aria-live="polite"
      className="sticky top-0 z-20 flex flex-row flex-wrap items-center gap-2 rounded-xl border bg-secondary/90 px-3 py-2 backdrop-blur"
    >
      <p
        key={step?.index ?? "idle"}
        className={cn("animate-fade-in min-w-0 flex-1 text-sm leading-snug", !step && "text-muted-foreground")}
      >
        {shown?.text ? shown.text.trim() : t("journal.empty")}
        {shown?.rule && (
          <span className="ml-1.5 rounded border px-1 font-mono text-[0.65rem] text-muted-foreground">{shown.rule}</span>
        )}
      </p>
      {paced.remaining > 0 && (
        <span className="font-mono text-xs text-muted-foreground">{t("pace.remaining", { count: paced.remaining })}</span>
      )}
      {step && !paced.ack && step.ms > 0 && (
        <span aria-hidden className="h-1 w-16 overflow-hidden rounded bg-border">
          <span
            key={step.index}
            className="play-progress block h-full bg-primary"
            style={{ animationDuration: `${step.ms}ms` }}
          />
        </span>
      )}
      <div className="flex flex-row flex-wrap items-center gap-1">
        {paced.busy && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={paced.skip}>
            <FastForward aria-hidden />
            <span className="max-sm:sr-only">{t("pace.skip")}</span>
          </Button>
        )}
        <PaceSettings paced={paced} />
      </div>
    </div>
  );
}

function PaceSettings({ paced }: { paced: PacedFeed }) {
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
}: {
  ack: Ack;
  view: EngineView;
  cards: TableCards;
  onContinue: () => void;
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
            {ack.kind === "turn" ? t("pace.yourTurn") : plain(ack.title)}
          </h2>
          {card?.text && (
            <p className="mt-1 line-clamp-4 whitespace-pre-line text-xs text-muted-foreground">{card.text}</p>
          )}
          {ack.kind === "turn" && <p className="mt-1 text-sm text-muted-foreground">{t("pace.sinceLastTurn")}</p>}
          {ack.lines.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-sm text-muted-foreground">
              {ack.lines.map((line, index) => (
                <li key={index}>{line}</li>
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
