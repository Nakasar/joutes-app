"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookOpen, Crown, Flag, Hourglass, Layers, Trash2, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

import { PlayCard } from "@/components/play/PlayCard";
import type { GameFeed } from "@/components/play/game-feed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mulliganChoice, mulliganLimit, sortChoices } from "@/lib/engine/anchors";
import type { TableCard, TableCards } from "@/lib/engine/cards";
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
  const { update, journal } = feed;
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
    />
  );

  const isRune = (obj: EngineObj) => cardOf(obj)?.kind === "rune";
  const others = view.players.filter((player) => player.seat !== me);
  const mine = view.players[me];
  const myHand = spectator ? [] : (mine.hand ?? []);
  const waitingFor = view.pending && view.pending.seat !== feed.seat ? view.players[view.pending.seat] : null;

  const toggleMulligan = (id: number) =>
    setMulliganState({
      key: promptKey,
      ids: mulligan.includes(id)
        ? mulligan.filter((value) => value !== id)
        : mulligan.length < mulliganMax
          ? [...mulligan, id]
          : mulligan,
    });

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
            legend={renderObj(player.legend, "sm")}
            champion={player.champion && (spectator || player.seat !== me) ? renderObj(player.champion, "sm") : null}
          />
        ))}
      </aside>

      {/* Table */}
      <main className="flex min-w-0 flex-col gap-3">
        {others.map((player) => (
          <BaseStrip
            key={player.seat}
            title={t("zone.baseOf", { name: player.name })}
            choices={choicesOn(`base:${player.seat}`)}
            onAct={act}
          >
            {view.bases[player.seat].filter((obj) => !isRune(obj)).map((obj) => renderObj(obj, "sm"))}
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
              choices={choicesOn(`bf:${bf.index}`)}
              onAct={act}
              card={renderObj(bf.card, "md")}
              renderObj={renderObj}
            />
          ))}
        </div>

        <BaseStrip
          title={spectator ? t("zone.baseOf", { name: mine.name }) : t("zone.myBase")}
          choices={choicesOn(`base:${me}`)}
          onAct={act}
          mine
        >
          {view.bases[me].filter((obj) => !isRune(obj)).map((obj) => renderObj(obj, "md"))}
          <Runes objs={view.bases[me].filter(isRune)} cards={cards} choicesOn={choicesOn} onAct={act} />
        </BaseStrip>

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
              {myHand.map((obj) =>
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
                ),
              )}
            </div>
          </section>
        )}
      </main>

      {/* Question, chaîne, journal */}
      <aside className="flex flex-col gap-3 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)]">
        <section
          aria-live="polite"
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
              {waitingFor ? t("prompt.waitingFor", { name: waitingFor.name }) : t("prompt.waiting")}
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
  legend: ReactNode;
  champion: ReactNode;
};

function PlayerPanel({ player, view, isMe, away, choices, onAct, onTrash, legend, champion }: PlayerPanelProps) {
  const t = useTranslations("Games.Play");
  const turn = view.turn_seat === player.seat;
  const deciding = view.pending?.seat === player.seat && !view.result;
  const power = DOMAINS.map((domain, index) => ({ domain, amount: player.pool.power[index] ?? 0 })).filter(
    (entry) => entry.amount > 0,
  );

  return (
    <section
      className={cn(
        "flex min-w-56 shrink-0 flex-col gap-2 rounded-xl border bg-card p-3 lg:min-w-0",
        turn && "border-primary/60",
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

      <div aria-label={t("player.points", { points: player.points, max: view.victory_score })}>
        <div className="flex flex-row flex-wrap gap-1">
          {Array.from({ length: view.victory_score }, (_, index) => (
            <span
              key={index}
              aria-hidden
              className={cn("size-2.5 rounded-full border", index < player.points ? "border-primary bg-primary" : "")}
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
  children: ReactNode;
};

function BaseStrip({ title, choices, onAct, mine = false, children }: BaseStripProps) {
  return (
    <section
      className={cn("rounded-xl border bg-card p-3", choices.length > 0 && "ring-2 ring-primary")}
      aria-label={title}
    >
      <div className="mb-2 flex flex-row flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
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
  choices: EngineChoice[];
  onAct: (action: EngineAction) => void;
  card: ReactNode;
  renderObj: (obj: EngineObj, size?: "xs" | "sm" | "md" | "lg") => ReactNode;
};

function BattlefieldColumn({ bf, view, me, showdown, choices, onAct, card, renderObj }: BattlefieldColumnProps) {
  const t = useTranslations("Games.Play");
  const mineHere = bf.units.filter((obj) => obj.controller === me);
  const theirs = view.players
    .filter((player) => player.seat !== me)
    .map((player) => ({ player, units: bf.units.filter((obj) => obj.controller === player.seat) }))
    .filter((group) => group.units.length > 0);
  const several = view.players.length > 2;

  const status =
    bf.contested_by !== null
      ? t("bf.contested", { name: view.players[bf.contested_by].name })
      : bf.controller !== null
        ? t("bf.controlled", { name: view.players[bf.controller].name })
        : t("bf.free");

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col items-center gap-2 rounded-xl border bg-card p-2 sm:p-3",
        showdown && "border-amber-500",
        choices.length > 0 && "ring-2 ring-primary",
      )}
    >
      <div className="flex min-h-20 w-full flex-col items-center justify-end gap-1">
        {theirs.map((group) => (
          <div key={group.player.seat} className="flex w-full flex-col items-center gap-1">
            {several && <span className="text-[0.65rem] text-muted-foreground">{group.player.name}</span>}
            <div className="flex flex-row flex-wrap justify-center gap-1.5">
              {group.units.map((obj) => renderObj(obj, "md"))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-1">
        {card}
        <div className="flex flex-row flex-wrap justify-center gap-1">
          <Badge
            variant={bf.controller === me ? "default" : "secondary"}
            className={cn(bf.contested_by !== null && "bg-amber-500 text-black")}
          >
            {status}
          </Badge>
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
