"use client";

import { useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Search, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TableCard } from "@/lib/engine/cards";
import { DOMAIN_COLORS, type Domain, type LimitedKind, type LimitedView } from "@/lib/engine/limited";
import type { CardFace, Faces } from "@/lib/engine/limited-faces";
import { cn } from "@/lib/utils";

export function DomainDot({ domain, className }: { domain: Domain; className?: string }) {
  return <Dot color={DOMAIN_COLORS[domain]} className={className} />;
}

/** La pastille d'un domaine ou d'un aspect. */
export function Dot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full border border-foreground/20", className)}
      style={{ background: color }}
    />
  );
}

/** Les pastilles des groupes d'une carte. */
export function FaceDots({ face, faces, className }: { face: CardFace | undefined; faces: Faces; className?: string }) {
  return (
    <>
      {faces.groups
        .filter((group) => face?.groups.includes(group.key))
        .map((group) => (
          <Dot key={group.key} color={group.color} className={className} />
        ))}
    </>
  );
}

type LimitedCardProps = {
  code: string;
  faces: Faces;
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
  /** Entoure les rares et mieux de leur couleur (ouverture d'un booster). */
  showRarity?: boolean;
  className?: string;
};

/** Une carte d'un booster, d'une réserve ou d'un deck : son illustration, ou son nom à défaut. */
export function LimitedCard({
  code,
  faces,
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
  const card = faces.get(code);
  const name = faces.name(code);
  const ring = showRarity ? (card?.ring ?? null) : null;
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
        // Sans illustration au catalogue : le nom, le coût et les groupes suffisent à choisir.
        <span className="flex size-full flex-col items-center justify-between p-1.5 text-center text-xs leading-tight">
          <span className="flex w-full items-center justify-between gap-1">
            <span className="font-bold tabular-nums">{card?.main && card.cost !== null ? card.cost : ""}</span>
            <span className="flex gap-0.5">
              <FaceDots face={card} faces={faces} className="size-2" />
            </span>
          </span>
          <span className="font-medium">{name}</span>
          <span className="text-[0.65rem] text-muted-foreground">{card?.kind ?? ""}</span>
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

/** La ligne d'une carte, avec « Brillante » pour un exemplaire brillant. */
export function useFaceLine(): (face: CardFace | undefined, foil?: boolean) => string {
  const t = useTranslations("Games.Limited");
  return (face, foil = false) => (!face ? "" : foil ? `${face.line} · ${t("foil")}` : face.line);
}

/** Une carte en grand, avec son texte. */
export function CardZoom({
  code,
  foil = false,
  faces,
  onClose,
  action,
}: {
  code: string | null;
  foil?: boolean;
  faces: Faces;
  onClose: () => void;
  /** Un bouton sous le texte (« Prendre cette carte »). */
  action?: ReactNode;
}) {
  const t = useTranslations("Games.Limited");
  const line = useFaceLine();
  const card = code ? faces.get(code) : undefined;
  return (
    <Dialog open={code !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{code ? faces.name(code) : ""}</DialogTitle>
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

/** Le nombre de cartes de chaque domaine ou aspect, en pastilles. */
export function GroupCounts({
  counts,
  faces,
  className,
}: {
  counts: Record<string, number>;
  faces: Faces;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-row flex-wrap gap-x-4 gap-y-1 text-sm", className)}>
      {faces.groups
        .filter((group) => (counts[group.key] ?? 0) > 0)
        .map((group) => (
          <span key={group.key} className="inline-flex items-center gap-1.5">
            <Dot color={group.color} />
            {group.label} <strong>{counts[group.key]}</strong>
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
  quitBody,
  children,
}: {
  title: string;
  subtitle: string;
  kind: LimitedKind;
  step: EventStep;
  onQuit: () => void;
  /** Ce que quitter fait perdre, quand ce n'est pas l'évènement gardé dans le navigateur. */
  quitBody?: string;
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
        description={quitBody ?? t("quitBody")}
        confirmLabel={t("quitConfirm")}
        cancelLabel={t("quitCancel")}
        destructive
        onConfirm={onQuit}
      />
    </header>
  );
}

/** Les joueurs de l'évènement et où chacun en est. */
export function SeatStrip({
  view,
  seat,
  away = [],
}: {
  view: Pick<LimitedView, "seats" | "phase">;
  seat: number;
  away?: number[];
}) {
  const t = useTranslations("Games.Limited");
  const tPlay = useTranslations("Games.Play");
  return (
    <ul className="flex flex-row flex-wrap gap-2 text-sm">
      {view.seats.map((player, index) => {
        const state = player.out
          ? t("seat.out")
          : away.includes(index) && !player.bot
            ? t("seat.away")
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

/** Une place du deck qui ne tient qu'une carte : la Légende, un champ de bataille, le leader. */
export function Slot({
  name,
  empty,
  onInspect,
  onRemove,
  removeLabel,
}: {
  name: string;
  empty: boolean;
  onInspect?: () => void;
  onRemove?: () => void;
  removeLabel: string;
}) {
  const t = useTranslations("Games.Limited");
  return (
    <span
      className={cn(
        "flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm",
        empty && "border-dashed text-muted-foreground",
      )}
    >
      <span className="flex-1 truncate">{name}</span>
      {onInspect && (
        <button type="button" onClick={onInspect} className="rounded p-1.5 text-muted-foreground hover:text-foreground">
          <Search className="size-3.5" aria-hidden />
          <span className="sr-only">{t("inspect", { name })}</span>
        </button>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} className="rounded p-1.5 text-muted-foreground hover:text-foreground">
          <X className="size-3.5" aria-hidden />
          <span className="sr-only">{removeLabel}</span>
        </button>
      )}
    </span>
  );
}

/** Une ligne du deck principal : un clic retire un exemplaire. */
export function DeckRow({
  code,
  count,
  name,
  faces,
  badge,
  cost,
  removeLabel,
  onRemove,
  onInspect,
}: {
  code: string;
  count: number;
  name: string;
  faces: Faces;
  badge?: string;
  /** Ce qui s'affiche à droite à la place du coût de la carte (un coût avec pénalité). */
  cost?: ReactNode;
  removeLabel: string;
  onRemove: () => void;
  onInspect: () => void;
}) {
  const t = useTranslations("Games.Limited");
  const card = faces.get(code);
  return (
    <li className="flex items-center gap-1 border-b last:border-b-0">
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded px-1 text-left hover:bg-secondary"
      >
        <span className="w-6 shrink-0 text-muted-foreground">×{count}</span>
        <span className="flex shrink-0 gap-0.5">
          <FaceDots face={card} faces={faces} className="size-2" />
        </span>
        <span className="truncate">{name}</span>
        {badge && <span className="shrink-0 rounded bg-secondary px-1.5 text-[0.7rem]">{badge}</span>}
        <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{cost ?? card?.cost ?? ""}</span>
      </button>
      <button type="button" onClick={onInspect} className="rounded p-1.5 text-muted-foreground hover:text-foreground">
        <Search className="size-3.5" aria-hidden />
        <span className="sr-only">{t("inspect", { name })}</span>
      </button>
    </li>
  );
}

/** Ce que le moteur reproche au deck, ou « Deck légal ». */
export function DeckProblems({ problems }: { problems: string[] }) {
  const t = useTranslations("Games.Limited");
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-5" aria-live="polite">
      <h2 className="flex items-center gap-2 font-semibold">
        {problems.length === 0 ? (
          <CircleCheck className="size-4 text-emerald-500" aria-hidden />
        ) : (
          <CircleAlert className="size-4 text-amber-500" aria-hidden />
        )}
        {t(problems.length === 0 ? "build.legal" : "build.problems", { count: problems.length })}
      </h2>
      {problems.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("build.checked")}</p>
    </section>
  );
}
