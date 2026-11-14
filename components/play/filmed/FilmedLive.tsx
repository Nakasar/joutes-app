"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AlertTriangle, HelpCircle, Minus, NotebookPen, Plus, ScrollText } from "lucide-react";
import { useTranslations } from "next-intl";

import { DOUBT_COLOR, SEAT_COLORS } from "@/components/play/filmed/FilmedStage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EngineObj, EngineView } from "@/lib/engine/types";
import { byTurn, clock, type Entry } from "@/lib/filmed/journal";
import type { Deviation, Explanation, Found } from "@/lib/filmed/types";
import { cn } from "@/lib/utils";

const ALERT = "#ff5a4a";

function names(objects: EngineObj[]): string {
  return objects.map((object) => object.name ?? "?").join(", ");
}

/** La table que le moteur croit vraie, d'après la caméra. */
export function TablePanel({ view, onCorrect }: { view: EngineView; onCorrect: () => void }) {
  const t = useTranslations("Games.Filmed");
  // L'adversaire en haut, comme dans l'image.
  const order = [...view.players].reverse();
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{t("table.title")}</h2>
        <span className="text-xs text-muted-foreground">{t("table.hint")}</span>
        <span className="grow" />
        <Button type="button" variant="outline" size="sm" onClick={onCorrect}>
          {t("table.correct")}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {order.map((player) => {
          const color = SEAT_COLORS[player.seat];
          const base = view.bases[player.seat] ?? [];
          const fields = view.battlefields
            .map((field) => ({
              name: field.card.name ?? "?",
              units: field.units.filter((unit) => unit.controller === player.seat),
              facedown: field.facedown.filter((card) => card.controller === player.seat).length,
            }))
            .filter((field) => field.units.length > 0 || field.facedown > 0);
          return (
            <div key={player.seat} className="flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: `${color}55` }}>
              <div className="flex flex-row items-baseline gap-2">
                <strong style={{ color }}>{player.name}</strong>
                <span className="truncate text-xs text-muted-foreground">{player.legend.name}</span>
                <span className="grow" />
                <span className="text-lg font-bold tabular-nums">
                  {view.points[player.seat] ?? player.points}
                  <span className="text-xs font-normal text-muted-foreground"> / {view.victory_score}</span>
                </span>
              </div>
              <div className="flex flex-row flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{t("table.hand", { count: player.hand_count })}</span>
                <span>{t("table.deck", { count: player.deck_count })}</span>
                <span>
                  {t("table.runes", { ready: player.runes_ready, total: player.runes_ready + player.runes_exhausted })}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 text-[13px]">
                {fields.map((field) => (
                  <div key={field.name}>
                    <span className="text-muted-foreground">{field.name} : </span>
                    <strong>{names(field.units)}</strong>
                    {field.facedown > 0 && (
                      <span>
                        {field.units.length > 0 ? ", " : ""}
                        {t("table.facedown", { count: field.facedown })}
                      </span>
                    )}
                  </div>
                ))}
                <div>
                  <span className="text-muted-foreground">{t("table.base")} : </span>
                  {base.length > 0 ? <strong>{names(base)}</strong> : <span className="text-muted-foreground">{t("table.empty")}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type AlertCardProps = {
  deviation: Deviation;
  time: number;
  busy: boolean;
  onRepaired: () => void;
  onTable: () => void;
  onReview: (() => void) | null;
};

/** Un écart : ce qui a été vu, la règle, et comment en sortir. */
export function AlertCard({ deviation, time, busy, onRepaired, onTable, onReview }: AlertCardProps) {
  const t = useTranslations("Games.Filmed");
  return (
    <section
      role="alert"
      className="flex flex-col gap-3 rounded-2xl border-2 p-4"
      style={{ borderColor: ALERT, background: "color-mix(in srgb, #ff5a4a 9%, var(--card))" }}
    >
      <div className="flex flex-row items-center gap-2">
        <AlertTriangle className="size-5 shrink-0" style={{ color: ALERT }} aria-hidden />
        <strong className="text-base">{deviation.title}</strong>
        <span className="grow" />
        <span className="font-mono text-xs text-muted-foreground">{clock(time)}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[13px] leading-snug">
        <dt className="text-muted-foreground">{t("alert.seen")}</dt>
        <dd>
          {deviation.seen.length > 0 ? deviation.seen.map((line) => <div key={line}>{line}</div>) : t("alert.seenNothing")}
        </dd>
        {deviation.reason && (
          <>
            <dt className="text-muted-foreground">{t("alert.rule")}</dt>
            <dd>
              {deviation.reason}
              {deviation.rule && <span className="text-muted-foreground"> ({t("alert.ruleNumber", { rule: deviation.rule })})</span>}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">{t("alert.nearest")}</dt>
        <dd>
          {deviation.nearest.lines.length > 0
            ? deviation.nearest.lines.map((line, index) => <div key={index}>{line}</div>)
            : t("alert.nearestNothing")}
        </dd>
      </dl>
      <div className="flex flex-row flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={onRepaired}>
          {t("alert.repaired")}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onTable}>
          {t("alert.tableRight")}
        </Button>
        {onReview && (
          <Button type="button" size="sm" variant="ghost" onClick={onReview}>
            {t("alert.review")}
          </Button>
        )}
      </div>
    </section>
  );
}

type QuestionCardProps = { options: Explanation[]; time: number; busy: boolean; onAnswer: (index: number) => void };

/** Plusieurs suites d'actions expliquent la table : à l'arbitre de dire laquelle. */
export function QuestionCard({ options, time, busy, onAnswer }: QuestionCardProps) {
  const t = useTranslations("Games.Filmed");
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-primary bg-primary/5 p-4">
      <div className="flex flex-row items-center gap-2">
        <HelpCircle className="size-5 shrink-0 text-primary" aria-hidden />
        <strong className="text-base">{t("question.title", { count: options.length })}</strong>
        <span className="grow" />
        <span className="font-mono text-xs text-muted-foreground">{clock(time)}</span>
      </div>
      <p className="text-[13px] leading-snug">{t("question.hint")}</p>
      {options.map((option, index) => (
        <Button
          key={index}
          type="button"
          variant="outline"
          disabled={busy}
          className="h-auto justify-start py-2 text-left whitespace-normal"
          onClick={() => onAnswer(index)}
        >
          <span className="flex flex-col gap-0.5 text-[13px] font-normal">
            {option.lines.map((line, at) => (
              <span key={at}>{line}</span>
            ))}
          </span>
        </Button>
      ))}
    </section>
  );
}

/** Le morceau d'image où se trouve une carte lue sans certitude. */
function Crop({ video, card }: { video: RefObject<HTMLVideoElement | null>; card: Found }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const source = video.current;
    const target = canvas.current;
    if (!source || !target) return;
    const xs = card.quad.map((point) => point[0]);
    const ys = card.quad.map((point) => point[1]);
    const margin = 12;
    const x = Math.max(0, Math.min(...xs) - margin);
    const y = Math.max(0, Math.min(...ys) - margin);
    const w = Math.max(...xs) + margin - x;
    const h = Math.max(...ys) + margin - y;
    target.width = Math.round(w);
    target.height = Math.round(h);
    target.getContext("2d")?.drawImage(source, x, y, w, h, 0, 0, target.width, target.height);
  }, [video, card]);
  return <canvas ref={canvas} className="max-h-32 w-24 shrink-0 rounded-md border object-contain" aria-hidden />;
}

type DoubtCardProps = {
  video: RefObject<HTMLVideoElement | null>;
  card: Found;
  remaining: number;
  cardName: (id: string) => string;
  /** Les cartes des deux decks, pour « autre carte ». */
  deckCards: string[];
  onDecide: (card: string | null) => void;
};

/** Une carte que la lecture n'a pas reconnue avec certitude. */
export function DoubtCard({ video, card, remaining, cardName, deckCards, onDecide }: DoubtCardProps) {
  const t = useTranslations("Games.Filmed");
  return (
    <section className="flex flex-col gap-3 rounded-2xl border p-4" style={{ borderColor: DOUBT_COLOR }}>
      <div className="flex flex-row items-center gap-2">
        <HelpCircle className="size-5 shrink-0" style={{ color: DOUBT_COLOR }} aria-hidden />
        <strong className="text-base">{t("doubt.title")}</strong>
        <span className="grow" />
        {remaining > 0 && <span className="text-xs text-muted-foreground">{t("doubt.more", { count: remaining })}</span>}
      </div>
      <div className="flex flex-row gap-3">
        <Crop video={video} card={card} />
        <div className="flex min-w-0 flex-1 flex-col gap-2 text-[13px]">
          <span>{t("doubt.hint")}</span>
          <Button type="button" size="sm" variant="outline" className="justify-between" onClick={() => onDecide(card.id)}>
            <strong className="truncate">{cardName(card.id)}</strong>
            <span className="text-muted-foreground">{t("doubt.points", { count: card.points })}</span>
          </Button>
          <Select onValueChange={(code) => onDecide(code)}>
            <SelectTrigger aria-label={t("doubt.other")} className="w-full">
              <SelectValue placeholder={t("doubt.other")} />
            </SelectTrigger>
            <SelectContent>
              {deckCards.map((code) => (
                <SelectItem key={code} value={code}>
                  {cardName(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => onDecide(null)}>
            {t("doubt.notACard")}
          </Button>
        </div>
      </div>
    </section>
  );
}

const ENTRY_COLOR: Partial<Record<Entry["kind"], string>> = {
  deviation: ALERT,
  question: "var(--primary)",
  forced: DOUBT_COLOR,
};

type JournalProps = {
  entries: Entry[];
  turn: number;
  seatName: (seat: number) => string;
  onNote: (text: string) => void;
  onScore: () => void;
  onReview: (entry: Entry) => void;
};

/** Le journal de la partie : ce tour, ou toute la partie. */
export function Journal({ entries, turn, seatName, onNote, onScore, onReview }: JournalProps) {
  const t = useTranslations("Games.Filmed");
  const [all, setAll] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const shown = useMemo(() => byTurn(all ? entries : entries.filter((entry) => entry.turn >= turn - 1)), [all, entries, turn]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [entries.length]);

  return (
    <section className="flex min-h-64 flex-1 flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-row items-center gap-2">
        <ScrollText className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="font-semibold">{t("journal.title")}</h2>
        <span className="grow" />
        <div className="flex rounded-lg border p-0.5 text-xs" role="radiogroup" aria-label={t("journal.title")}>
          {([false, true] as const).map((whole) => (
            <button
              key={String(whole)}
              type="button"
              role="radio"
              aria-checked={all === whole}
              className={cn("rounded-md px-2 py-1", all === whole && "bg-secondary font-medium")}
              onClick={() => setAll(whole)}
            >
              {whole ? t("journal.all") : t("journal.thisTurn")}
            </button>
          ))}
        </div>
      </div>
      <div className="flex max-h-[26rem] min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {shown.length === 0 && <p className="text-[13px] text-muted-foreground">{t("journal.empty")}</p>}
        {shown.map((group) => (
          <div key={`${group.turn}-${group.seat}-${group.entries[0].id}`} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
              <span className="size-2 rounded-full" style={{ background: SEAT_COLORS[group.seat] }} />
              {t("journal.turn", { turn: group.turn, name: seatName(group.seat) })}
            </div>
            {group.entries.map((entry) => (
              <div key={entry.id} className="grid grid-cols-[3rem_1fr] gap-x-2 text-[13px] leading-snug">
                <span className="font-mono text-xs text-muted-foreground">{clock(entry.time)}</span>
                <span style={{ color: ENTRY_COLOR[entry.kind] }}>
                  {entry.kind === "deviation" && entry.deviation && <strong>{entry.deviation.title}. </strong>}
                  {entry.kind === "note" && <NotebookPen className="mr-1 inline size-3.5" aria-hidden />}
                  {entry.lines.map((line, index) => (
                    <span key={index} className="block text-foreground">
                      {line}
                    </span>
                  ))}
                  {entry.resolution && (
                    <span className="block text-xs text-muted-foreground">{t(`journal.resolution.${entry.resolution}`)}</span>
                  )}
                  {entry.shot && (entry.kind === "deviation" || entry.kind === "question") && (
                    <button type="button" className="text-xs text-primary underline" onClick={() => onReview(entry)}>
                      {t("alert.review")}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}
        <div ref={end} />
      </div>
      {note !== null ? (
        <form
          className="flex flex-row gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (note.trim()) onNote(note.trim());
            setNote(null);
          }}
        >
          <Input autoFocus value={note} maxLength={200} aria-label={t("journal.note")} onChange={(event) => setNote(event.target.value)} />
          <Button type="submit" size="sm">
            {t("journal.add")}
          </Button>
        </form>
      ) : (
        <div className="flex flex-row flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onScore}>
            {t("journal.score")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setNote("")}>
            {t("journal.note")}
          </Button>
        </div>
      )}
    </section>
  );
}

function Stepper({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  const t = useTranslations("Games.Filmed");
  return (
    <div className="flex flex-row items-center gap-2 text-sm">
      <span className="min-w-0 flex-1">{label}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8"
        aria-label={t("correct.less", { label })}
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="size-4" aria-hidden />
      </Button>
      <span className="w-6 text-center font-bold tabular-nums">{value}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8"
        aria-label={t("correct.more", { label })}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

type CorrectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: EngineView;
  facedown: number[][];
  busy: boolean;
  onPoints: (seat: number, points: number) => void;
  onFacedown: (battlefield: number, seat: number, count: number) => void;
  onTable: () => void;
};

/** Ce que la caméra ne voit pas (score, cartes face cachée), et « la table a raison ». */
export function CorrectDialog({ open, onOpenChange, view, facedown, busy, onPoints, onFacedown, onTable }: CorrectDialogProps) {
  const t = useTranslations("Games.Filmed");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("correct.title")}</DialogTitle>
          <DialogDescription>{t("correct.hint")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t("correct.score")}</h3>
            {view.players.map((player) => (
              <Stepper
                key={player.seat}
                label={player.name}
                value={view.points[player.seat] ?? 0}
                max={view.victory_score}
                onChange={(points) => onPoints(player.seat, points)}
              />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t("correct.facedown")}</h3>
            {view.battlefields.map((field, index) =>
              view.players.map((player) => (
                <Stepper
                  key={`${index}-${player.seat}`}
                  label={t("correct.facedownAt", { name: player.name, battlefield: field.card.name ?? "?" })}
                  value={facedown[index]?.[player.seat] ?? 0}
                  max={3}
                  onChange={(count) => onFacedown(index, player.seat, count)}
                />
              )),
            )}
          </div>
          <div className="flex flex-col gap-2 rounded-xl border p-3">
            <p className="text-[13px] leading-snug text-muted-foreground">{t("correct.tableHint")}</p>
            <Button type="button" variant="outline" size="sm" className="self-start" disabled={busy} onClick={onTable}>
              {t("alert.tableRight")}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("correct.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
