"use client";

import { Search, Shield, Sword, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { TableCard } from "@/lib/engine/cards";
import type { EngineAction, EngineChoice, EngineObj } from "@/lib/engine/types";
import { cn } from "@/lib/utils";

export type CardSize = "xs" | "sm" | "md" | "lg";

const WIDTH: Record<CardSize, string> = {
  xs: "w-9",
  sm: "w-14",
  md: "w-[4.5rem] sm:w-20",
  lg: "w-24 sm:w-28",
};

const LANDSCAPE_WIDTH: Record<CardSize, string> = {
  xs: "w-14",
  sm: "w-20",
  md: "w-28 sm:w-36",
  lg: "w-40 sm:w-48",
};

export type PlayCardProps = {
  obj?: EngineObj;
  card?: TableCard;
  size?: CardSize;
  /** Les actions que le moteur permet sur cette carte, maintenant. */
  choices?: EngineChoice[];
  onAct?: (action: EngineAction) => void;
  onInspect?: () => void;
  /** Mulligan : la carte est cochée. */
  selected?: boolean;
  /** Atténuée : une autre carte ou un autre choix est attendu. */
  dim?: boolean;
  /** Concernée par l'évènement que la table raconte : entourée d'ambre. */
  focus?: boolean;
  /** Dégâts reçus dans l'évènement raconté : la carte tremble et les affiche. */
  hit?: number;
  /** Une unité qui vient de mourir, encore dessinée le temps de le raconter. */
  dying?: boolean;
  className?: string;
};

/**
 * Une carte sur la table. Entourée de cyan quand le moteur permet d'agir
 * dessus ; un clic joue l'action, ou ouvre la liste s'il y en a plusieurs.
 * Sans action, le clic montre la carte en grand.
 */
export function PlayCard({
  obj,
  card,
  size = "md",
  choices = [],
  onAct,
  onInspect,
  selected = false,
  dim = false,
  focus = false,
  hit,
  dying = false,
  className,
}: PlayCardProps) {
  const t = useTranslations("Games.Play");
  const hidden = obj ? obj.code === null : !card;
  const landscape = card?.landscape === true;
  const name = card?.name ?? obj?.name ?? t("card.hidden");
  const actionable = choices.length > 0 && onAct !== undefined;
  const exhausted = obj?.exhausted === true;
  const small = size === "xs" || size === "sm";

  const face = (
    <span
      className={cn(
        "play-enter relative block overflow-hidden rounded-md border bg-muted transition duration-500",
        landscape ? "aspect-[7/5]" : "aspect-[5/7]",
        landscape ? LANDSCAPE_WIDTH[size] : WIDTH[size],
        exhausted && "rotate-[8deg] opacity-60 saturate-50",
        dim && !actionable && "opacity-50",
        actionable && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        selected && "ring-2 ring-destructive ring-offset-1 ring-offset-background",
        focus && !actionable && !selected && "play-focus",
        hit !== undefined && "play-shake",
        dying && "scale-90 opacity-25 grayscale",
      )}
    >
      {hidden ? (
        <span
          aria-hidden
          className="absolute inset-0 bg-[repeating-linear-gradient(135deg,var(--secondary)_0_6px,var(--card)_6px_12px)]"
        />
      ) : card?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.image} alt="" loading="lazy" className="size-full object-cover" draggable={false} />
      ) : (
        <span className="flex size-full items-center justify-center p-1 text-center text-[0.6rem] leading-tight text-muted-foreground">
          {name}
        </span>
      )}

      {obj?.role && !small && (
        <span className="absolute left-0.5 top-0.5 rounded bg-background/85 p-0.5 text-foreground">
          {obj.role === "Attacker" ? <Sword className="size-3" aria-hidden /> : <Shield className="size-3" aria-hidden />}
          <span className="sr-only">{t(obj.role === "Attacker" ? "card.attacker" : "card.defender")}</span>
        </span>
      )}

      {obj?.stunned && (
        <span className="absolute right-0.5 top-0.5 rounded bg-amber-500 p-0.5 text-black">
          <Zap className="size-3" aria-hidden />
          <span className="sr-only">{t("card.stunned")}</span>
        </span>
      )}

      {obj && obj.might !== null && !hidden && obj.zone !== "Hand" && obj.zone !== "Champion" && (
        <span className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5">
          {obj.buffs > 0 && (
            <span className="rounded bg-emerald-600 px-1 text-[0.6rem] font-bold leading-4 text-white">+{obj.buffs}</span>
          )}
          {obj.damage > 0 && (
            <span className="rounded bg-destructive px-1 text-[0.6rem] font-bold leading-4 text-white">
              −{obj.damage}
            </span>
          )}
          <span
            className={cn(
              "rounded px-1 text-xs font-bold leading-4",
              obj.damage > 0 ? "bg-destructive text-white" : "bg-background/90 text-foreground",
            )}
          >
            {obj.might}
          </span>
        </span>
      )}
    </span>
  );

  const damage =
    hit !== undefined ? (
      <span
        aria-hidden
        className="play-float pointer-events-none absolute left-1/2 top-1/4 z-20 text-lg font-bold text-destructive drop-shadow"
      >
        −{hit}
      </span>
    ) : null;

  const label = actionable ? (choices.length === 1 ? choices[0].label : name) : name;

  const inspect =
    actionable && onInspect ? (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onInspect();
        }}
        className="absolute -left-1 -top-1 z-10 rounded-full border bg-background p-0.5 text-muted-foreground opacity-0 transition hover:text-foreground focus-visible:opacity-100 group-hover/card:opacity-100 max-lg:opacity-100"
      >
        <Search className="size-3" aria-hidden />
        <span className="sr-only">{t("card.inspect", { name })}</span>
      </button>
    ) : null;

  if (actionable && choices.length > 1) {
    return (
      <span className={cn("group/card relative inline-block shrink-0", className)}>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" title={name} aria-label={name} className="block cursor-pointer rounded-md">
              {face}
            </button>
          </PopoverTrigger>
          <PopoverContent className="flex w-64 flex-col gap-2 p-2">
            <p className="px-1 text-sm font-medium">{name}</p>
            {choices.map((choice, index) => (
              <Button
                key={index}
                variant="secondary"
                size="sm"
                className="h-auto justify-start whitespace-normal py-1.5 text-left"
                onClick={() => onAct?.(choice.action)}
              >
                {choice.label}
              </Button>
            ))}
          </PopoverContent>
        </Popover>
        {inspect}
        {damage}
      </span>
    );
  }

  return (
    <span className={cn("group/card relative inline-block shrink-0", className)}>
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={selected || undefined}
        onClick={() => (actionable ? onAct?.(choices[0].action) : onInspect?.())}
        onContextMenu={(event) => {
          if (!onInspect) return;
          event.preventDefault();
          onInspect();
        }}
        className={cn("block rounded-md", (actionable || onInspect) && "cursor-pointer")}
      >
        {face}
      </button>
      {inspect}
      {damage}
    </span>
  );
}
