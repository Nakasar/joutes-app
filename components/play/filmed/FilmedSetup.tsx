"use client";

import type { ReactNode } from "react";
import { AlertCircle, Camera, Check, FileVideo, Loader2, ScanSearch } from "lucide-react";
import { useTranslations } from "next-intl";

import { DeckPicker } from "@/components/play/DeckPicker";
import { SEAT_COLORS } from "@/components/play/filmed/FilmedStage";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TableCards } from "@/lib/engine/cards";
import type { LobbyDeck } from "@/lib/engine/lobby-decks";
import { cn } from "@/lib/utils";

export type SeatSetup = {
  name: string;
  deck: LobbyDeck | null;
  /** Les illustrations du deck sont en cours d'apprentissage. */
  learning: boolean;
  /** Combien d'illustrations n'ont pas pu être apprises. */
  failed: number;
};

export type SourceKind = "camera" | "file";

/** En dessous de cette largeur de carte, en pixels, la lecture devient incertaine. */
export const TIGHT_CARD = 140;

type FilmedSetupProps = {
  decks: LobbyDeck[];
  cards: TableCards;
  seats: SeatSetup[];
  onName: (seat: number, name: string) => void;
  onDeck: (seat: number, deck: LobbyDeck | null) => void;
  /** Où chaque joueur est assis dans l'image. */
  sideways: boolean;
  onSideways: (sideways: boolean) => void;

  sourceKind: SourceKind;
  onSourceKind: (kind: SourceKind) => void;
  devices: { id: string; label: string }[];
  device: string | null;
  onDevice: (id: string) => void;
  fileName: string | null;
  onFile: (file: File) => void;
  sourceError: string | null;
  sourceSize: { width: number; height: number } | null;

  reading: boolean;
  onRead: () => void;
  /** Le résultat de l'essai de lecture, ou `null` avant le premier essai. */
  trial: { found: number; sure: number; cardWidth: number | null } | null;
  battlefields: (string | null)[];
  onBattlefield: (seat: number, code: string) => void;
  first: number;
  onFirst: (seat: number) => void;
  underway: boolean;
  onUnderway: (underway: boolean) => void;

  /** Ce qui empêche de commencer, ou `null`. */
  blocked: string | null;
  starting: boolean;
  onStart: () => void;
};

function Step({ number, done, title, active, children }: { number: number; done: boolean; title: string; active?: boolean; children: ReactNode }) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-4", active && "border-primary bg-primary/5")}>
      <h2 className="flex items-center gap-2.5 text-base font-semibold">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-[13px] font-bold text-[#04121b]",
            done ? "bg-emerald-400" : "bg-primary",
          )}
        >
          {number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Line({ tone, children }: { tone: "ok" | "warn" | "wait"; children: ReactNode }) {
  return (
    <span className="flex items-start gap-2 text-[13px]">
      {tone === "ok" ? (
        <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
      ) : tone === "warn" ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
      ) : (
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      )}
      <span>{children}</span>
    </span>
  );
}

/** La préparation d'une table filmée : les deux decks, la source de l'image, le calibrage. */
export function FilmedSetup(props: FilmedSetupProps) {
  const t = useTranslations("Games.Filmed");
  const { seats, cards, sideways, trial, battlefields } = props;
  const decksReady = seats.every((seat) => seat.deck?.list && !seat.learning);
  const sides = sideways ? (["left", "right"] as const) : (["bottom", "top"] as const);
  const name = (seat: number) => seats[seat].name.trim() || t("setup.player", { number: seat + 1 });

  return (
    <aside className="flex flex-col gap-3.5">
      <Step number={1} done={decksReady} title={t("setup.decksTitle")}>
        {seats.map((seat, index) => {
          const list = seat.deck?.list;
          const uncovered = list
            ? new Set([list.champion, ...list.main].filter((code) => cards[code] && !cards[code].playable)).size
            : 0;
          return (
            <div key={index} className="flex flex-col gap-1.5">
              <Label htmlFor={`filmed-name-${index}`} className="text-xs" style={{ color: SEAT_COLORS[index] }}>
                {t(`setup.side.${sides[index]}`)}
              </Label>
              <div className="flex flex-row gap-2">
                <Input
                  id={`filmed-name-${index}`}
                  value={seat.name}
                  maxLength={24}
                  placeholder={t("setup.player", { number: index + 1 })}
                  onChange={(event) => props.onName(index, event.target.value)}
                  className="w-28 shrink-0"
                />
                <DeckPicker
                  id={`filmed-deck-${index}`}
                  srLabel={t("setup.deckOf", { name: name(index) })}
                  decks={props.decks}
                  legends={[]}
                  cards={cards}
                  value={seat.deck ? { kind: "deck", deckId: seat.deck.id } : null}
                  onChange={(choice, deck) => props.onDeck(index, choice.kind === "deck" ? (deck ?? null) : null)}
                  className="min-w-0 flex-1"
                />
              </div>
              {seat.learning && <Line tone="wait">{t("setup.learning")}</Line>}
              {list && !seat.learning && (
                <span className="text-xs text-muted-foreground">
                  {t("setup.deckSize", {
                    count: list.main.length + 1 + list.runes.length,
                    distinct: new Set([list.champion, ...list.main, ...list.runes]).size,
                  })}
                </span>
              )}
              {seat.failed > 0 && <Line tone="warn">{t("setup.artFailed", { count: seat.failed })}</Line>}
              {uncovered > 0 && <Line tone="warn">{t("setup.uncovered", { count: uncovered })}</Line>}
            </div>
          );
        })}
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox checked={sideways} onCheckedChange={(checked) => props.onSideways(checked === true)} />
          {t("setup.sideways")}
        </label>
        <p className="text-xs leading-snug text-muted-foreground">{t("setup.decksHint")}</p>
      </Step>

      <Step number={2} done={props.sourceSize !== null} title={t("setup.sourceTitle")}>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("setup.sourceTitle")}>
          {(["camera", "file"] as const).map((kind) => (
            <Button
              key={kind}
              type="button"
              role="radio"
              aria-checked={props.sourceKind === kind}
              variant={props.sourceKind === kind ? "default" : "outline"}
              size="sm"
              onClick={() => props.onSourceKind(kind)}
            >
              {kind === "camera" ? <Camera className="size-4" aria-hidden /> : <FileVideo className="size-4" aria-hidden />}
              {t(`setup.source.${kind}`)}
            </Button>
          ))}
        </div>
        {props.sourceKind === "camera" ? (
          props.devices.length > 0 && (
            <Select value={props.device ?? ""} onValueChange={props.onDevice}>
              <SelectTrigger aria-label={t("setup.pickCamera")} className="w-full">
                <SelectValue placeholder={t("setup.pickCamera")} />
              </SelectTrigger>
              <SelectContent>
                {props.devices.map((device, index) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.label || t("setup.cameraNumber", { number: index + 1 })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        ) : (
          <div className="flex flex-col gap-1">
            <Label htmlFor="filmed-file" className="sr-only">
              {t("setup.pickFile")}
            </Label>
            <Input
              id="filmed-file"
              type="file"
              accept="video/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) props.onFile(file);
              }}
            />
            {props.fileName && <span className="text-xs text-muted-foreground">{t("setup.fileHint")}</span>}
          </div>
        )}
        {props.sourceSize && (
          <span className="text-xs text-muted-foreground">
            {t("setup.sourceSize", { width: props.sourceSize.width, height: props.sourceSize.height })}
          </span>
        )}
        {props.sourceError && <Line tone="warn">{props.sourceError}</Line>}
        <p className="text-xs leading-snug text-muted-foreground">{t("setup.sourceHint")}</p>
      </Step>

      <Step number={3} done={trial !== null && trial.sure > 0} title={t("setup.calibrationTitle")} active>
        <p className="text-sm leading-snug">{t("setup.calibrationHint")}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={!decksReady || !props.sourceSize || props.reading}
          onClick={props.onRead}
        >
          {props.reading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ScanSearch className="size-4" aria-hidden />}
          {props.reading ? t("setup.reading") : trial ? t("setup.readAgain") : t("setup.read")}
        </Button>
        {trial && (
          <div className="flex flex-col gap-1.5">
            <Line tone={trial.sure > 0 ? "ok" : "warn"}>{t("setup.trial", { sure: trial.sure, found: trial.found })}</Line>
            {trial.cardWidth !== null &&
              (trial.cardWidth < TIGHT_CARD ? (
                <Line tone="warn">{t("setup.cardTight", { width: Math.round(trial.cardWidth) })}</Line>
              ) : (
                <Line tone="ok">{t("setup.cardFine", { width: Math.round(trial.cardWidth) })}</Line>
              ))}
          </div>
        )}
        {seats.map((seat, index) => {
          const options = seat.deck?.list?.battlefields ?? [];
          if (options.length === 0) return null;
          return (
            <div key={index} className="flex flex-col gap-1">
              <Label htmlFor={`filmed-bf-${index}`} className="text-xs" style={{ color: SEAT_COLORS[index] }}>
                {t("setup.battlefieldOf", { name: name(index) })}
              </Label>
              <Select value={battlefields[index] ?? ""} onValueChange={(code) => props.onBattlefield(index, code)}>
                <SelectTrigger id={`filmed-bf-${index}`} className="w-full">
                  <SelectValue placeholder={t("setup.pickBattlefield")} />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set(options)].map((code) => (
                    <SelectItem key={code} value={code}>
                      {cards[code]?.name ?? code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
        <div className="flex flex-col gap-1">
          <Label htmlFor="filmed-first" className="text-xs">
            {t("setup.first")}
          </Label>
          <Select value={String(props.first)} onValueChange={(value) => props.onFirst(Number(value))}>
            <SelectTrigger id="filmed-first" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {seats.map((_, index) => (
                <SelectItem key={index} value={String(index)}>
                  {name(index)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-start gap-2 text-[13px]">
          <Checkbox
            className="mt-0.5"
            checked={props.underway}
            onCheckedChange={(checked) => props.onUnderway(checked === true)}
          />
          <span>
            {t("setup.underway")}
            <span className="block text-xs text-muted-foreground">{t("setup.underwayHint")}</span>
          </span>
        </label>
      </Step>

      {props.blocked && <p className="text-xs text-muted-foreground">{props.blocked}</p>}
      <Button type="button" size="lg" disabled={props.blocked !== null || props.starting} onClick={props.onStart}>
        {props.starting && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {t("setup.start")}
      </Button>
    </aside>
  );
}
