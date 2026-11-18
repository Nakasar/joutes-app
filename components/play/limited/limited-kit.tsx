"use client";

import { useState, type ReactNode } from "react";
import { Search, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TableCard, TableCards } from "@/lib/engine/cards";
import {
  BLANK_BATTLEFIELD,
  BLANK_LEGEND,
  DOMAIN_COLORS,
  DOMAINS,
  RARITY_COLORS,
  type Domain,
  type LimitedKind,
  type LimitedView,
} from "@/lib/engine/limited";
import { cn } from "@/lib/utils";

type Translate = ReturnType<typeof useTranslations>;

/** Le nom d'une carte, y compris celles que seul le limité connaît. */
export function cardName(code: string, cards: TableCards, t: Translate): string {
  if (code === BLANK_BATTLEFIELD) return t("blankBattlefield");
  if (code === BLANK_LEGEND) return t("noLegend");
  return cards[code]?.name ?? code;
}

export function DomainDot({ domain, className }: { domain: Domain; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ background: DOMAIN_COLORS[domain] }}
    />
  );
}

function domainsOf(card: TableCard | undefined): Domain[] {
  return DOMAINS.filter((domain) => card?.domains.includes(domain));
}

/** « Unité · champion · Ordre · coût 4 · Rare » */
export function useCardLine(): (card: TableCard | undefined, foil?: boolean) => string {
  const t = useTranslations("Games.Limited");
  const tPlay = useTranslations("Games.Play");
  return (card, foil = false) => {
    if (!card) return "";
    const parts: string[] = [tPlay(`kind.${card.kind}`)];
    if (card.champion) parts.push(t("champion"));
    const domains = domainsOf(card).map((domain) => tPlay(`domain.${domain}`));
    if (domains.length > 0) parts.push(domains.join(", "));
    if (card.kind === "unit" || card.kind === "spell" || card.kind === "gear") {
      parts.push(t("cost", { energy: card.energy }));
    }
    if (card.kind === "unit" && card.might !== undefined) parts.push(t("might", { might: card.might }));
    if (card.rarity) parts.push(t(`rarity.${card.rarity}`));
    if (foil) parts.push(t("foil"));
    return parts.join(" · ");
  };
}

type LimitedCardProps = {
  code: string;
  cards: TableCards;
  foil?: boolean;
  /** Atténuée : hors de l'identité du deck. */
  dim?: boolean;
  selected?: boolean;
  /** Nombre d'exemplaires, affiché à partir de deux. */
  count?: number;
  /** Une ligne sous la carte. */
  note?: ReactNode;
  /** Ce que fait un clic, dit aux lecteurs d'écran. */
  label?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onInspect?: () => void;
  /** Entoure les rares et les épiques de leur couleur (ouverture d'un booster). */
  showRarity?: boolean;
  className?: string;
};

/** Une carte d'un booster, d'une réserve ou d'un deck : son illustration, ou son nom à défaut. */
export function LimitedCard({
  code,
  cards,
  foil = false,
  dim = false,
  selected = false,
  count = 1,
  note,
  label,
  onClick,
  onDoubleClick,
  onInspect,
  showRarity = false,
  className,
}: LimitedCardProps) {
  const t = useTranslations("Games.Limited");
  const tPlay = useTranslations("Games.Play");
  const card = cards[code];
  const name = cardName(code, cards, t);
  const ring =
    showRarity && card?.rarity && (card.rarity === "rare" || card.rarity === "epic") ? RARITY_COLORS[card.rarity] : null;
  const face = (
    <span
      className={cn(
        "relative block overflow-hidden rounded-md border bg-muted transition",
        card?.landscape ? "aspect-[7/5]" : "aspect-[5/7]",
        dim && "opacity-40",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
      style={ring && !selected ? { boxShadow: `0 0 0 2px ${ring}` } : undefined}
    >
      {card?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.image} alt="" loading="lazy" className="size-full object-cover" draggable={false} />
      ) : (
        // Sans illustration au catalogue : le nom, le coût et les domaines suffisent à choisir.
        <span className="flex size-full flex-col items-center justify-between p-1.5 text-center text-xs leading-tight">
          <span className="flex w-full items-center justify-between gap-1">
            <span className="font-bold tabular-nums">{card && isMainCard(card) ? card.energy : ""}</span>
            <span className="flex gap-0.5">
              {domainsOf(card).map((domain) => (
                <DomainDot key={domain} domain={domain} className="size-2" />
              ))}
            </span>
          </span>
          <span className="font-medium">{name}</span>
          <span className="text-[0.65rem] text-muted-foreground">{card ? tPlay(`kind.${card.kind}`) : ""}</span>
        </span>
      )}
      {foil && (
        <span className="absolute left-1 top-1 rounded bg-background/85 p-0.5 text-cyan-300">
          <Sparkles className="size-3.5" aria-hidden />
          <span className="sr-only">{t("foil")}</span>
        </span>
      )}
      {count > 1 && (
        <span className="absolute bottom-1 right-1 rounded bg-background/90 px-1.5 text-xs font-bold leading-5">
          ×{count}
        </span>
      )}
    </span>
  );
  return (
    <span className={cn("group/card relative flex min-w-0 flex-col gap-1", className)}>
      {onClick ? (
        <button
          type="button"
          aria-label={label ?? name}
          aria-pressed={selected || undefined}
          title={name}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          className="block cursor-pointer rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {face}
        </button>
      ) : (
        <span title={name}>{face}</span>
      )}
      {onInspect && (
        <button
          type="button"
          onClick={onInspect}
          className="absolute right-1 top-1 rounded-full border bg-background/90 p-1 text-muted-foreground opacity-0 transition hover:text-foreground focus-visible:opacity-100 group-hover/card:opacity-100 max-lg:opacity-100"
        >
          <Search className="size-3.5" aria-hidden />
          <span className="sr-only">{t("inspect", { name })}</span>
        </button>
      )}
      {note && <span className="truncate text-xs text-muted-foreground">{note}</span>}
    </span>
  );
}

/** Une carte en grand, avec son texte. */
export function CardZoom({
  code,
  foil = false,
  cards,
  onClose,
  action,
}: {
  code: string | null;
  foil?: boolean;
  cards: TableCards;
  onClose: () => void;
  /** Un bouton sous le texte (« Prendre cette carte »). */
  action?: ReactNode;
}) {
  const t = useTranslations("Games.Limited");
  const line = useCardLine();
  const card = code ? cards[code] : undefined;
  return (
    <Dialog open={code !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{code ? cardName(code, cards, t) : ""}</DialogTitle>
          <DialogDescription>{line(card, foil)}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-row flex-wrap gap-4">
          {card?.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.image} alt="" className={cn("rounded-lg border", card.landscape ? "w-full max-w-sm" : "w-52")} />
          )}
          <div className="flex min-w-48 flex-1 flex-col gap-3">
            {card?.text ? (
              <p className="whitespace-pre-line text-sm">{card.text}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noText")}</p>
            )}
            {action}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** La courbe des coûts : huit colonnes, la dernière pour 7 et plus. */
export function CostCurve({ curve, className }: { curve: number[]; className?: string }) {
  const t = useTranslations("Games.Limited");
  const top = Math.max(1, ...curve);
  return (
    <div
      role="img"
      aria-label={t("curveLabel", { list: curve.map((count, cost) => `${cost === 7 ? "7+" : cost} : ${count}`).join(", ") })}
      className={cn("flex h-20 items-end gap-1.5", className)}
    >
      {curve.map((count, cost) => (
        <div key={cost} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[0.7rem] leading-none text-muted-foreground">{count > 0 ? count : ""}</span>
          <div
            className={cn("w-full rounded-t", count > 0 ? "bg-primary" : "bg-border")}
            style={{ height: count > 0 ? `${Math.round((count / top) * 60) + 8}%` : "3px" }}
          />
          <span className="text-[0.7rem] leading-none text-muted-foreground">{cost === 7 ? "7+" : cost}</span>
        </div>
      ))}
    </div>
  );
}

/** Le nombre de cartes de chaque domaine, en pastilles. */
export function DomainCounts({ counts, className }: { counts: Record<Domain, number>; className?: string }) {
  const tPlay = useTranslations("Games.Play");
  return (
    <div className={cn("flex flex-row flex-wrap gap-x-4 gap-y-1 text-sm", className)}>
      {DOMAINS.filter((domain) => counts[domain] > 0).map((domain) => (
        <span key={domain} className="inline-flex items-center gap-1.5">
          <DomainDot domain={domain} />
          {tPlay(`domain.${domain}`)} <strong>{counts[domain]}</strong>
        </span>
      ))}
    </div>
  );
}

export type EventStep = "open" | "build" | "match";

/** Le bandeau d'un évènement : son nom, où on en est, et la sortie. */
export function EventHeader({
  title,
  subtitle,
  kind,
  step,
  onQuit,
  children,
}: {
  title: string;
  subtitle: string;
  kind: LimitedKind;
  step: EventStep;
  onQuit: () => void;
  /** Les actions de l'écran (« Valider mon deck »). */
  children?: ReactNode;
}) {
  const t = useTranslations("Games.Limited");
  const [asking, setAsking] = useState(false);
  const steps: { key: EventStep; label: string }[] = [
    { key: "open", label: t(kind === "draft" ? "step.draft" : "step.open") },
    { key: "build", label: t("step.build") },
    { key: "match", label: t("step.match") },
  ];
  return (
    <header className="flex flex-row flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border bg-card px-5 py-3">
      <div className="mr-auto flex min-w-0 flex-col">
        <span className="truncate text-lg font-bold">{title}</span>
        <span className="text-sm text-muted-foreground">{subtitle}</span>
      </div>
      <ol className="flex flex-row flex-wrap gap-2 text-sm">
        {steps.map(({ key, label }, index) => (
          <li
            key={key}
            aria-current={key === step ? "step" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5",
              key === step ? "border-primary bg-primary font-bold text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {index + 1} · {label}
          </li>
        ))}
      </ol>
      {children}
      <Button variant="outline" onClick={() => setAsking(true)}>
        {t("quit")}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={t("quitTitle")}
        description={t("quitBody")}
        confirmLabel={t("quitConfirm")}
        cancelLabel={t("quitCancel")}
        destructive
        onConfirm={onQuit}
      />
    </header>
  );
}

/** Les joueurs de l'évènement et où chacun en est. */
export function SeatStrip({ view, seat }: { view: LimitedView; seat: number }) {
  const t = useTranslations("Games.Limited");
  const tPlay = useTranslations("Games.Play");
  return (
    <ul className="flex flex-row flex-wrap gap-2 text-sm">
      {view.seats.map((player, index) => {
        const state = player.out
          ? t("seat.out")
          : view.phase === "draft"
            ? player.waiting > 0
              ? t("seat.picking")
              : t("seat.waiting")
            : player.ready
              ? t("seat.ready")
              : t("seat.building");
        const busy = !player.out && (view.phase === "draft" ? player.waiting > 0 : !player.ready);
        return (
          <li
            key={index}
            className={cn(
              "flex min-w-0 flex-col rounded-lg border px-3 py-1.5 leading-tight",
              index === seat && "border-primary/60 bg-primary/5",
            )}
          >
            <span className="flex items-center gap-1.5 font-medium">
              <span aria-hidden className={cn("size-2 rounded-full", busy ? "bg-amber-400" : "bg-emerald-500")} />
              <span className="truncate">{player.name}</span>
              {index === seat && <span className="rounded bg-secondary px-1 text-[0.7rem]">{tPlay("lobby.youBadge")}</span>}
            </span>
            <span className="text-xs text-muted-foreground">
              {player.bot ? `${tPlay(`level.${player.bot}`)} · ${state}` : state}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Les cartes qui entrent dans un deck principal (ni Légende, ni champ de bataille, ni rune). */
export function isMainCard(card: TableCard | undefined): boolean {
  return card !== undefined && (card.kind === "unit" || card.kind === "spell" || card.kind === "gear");
}
