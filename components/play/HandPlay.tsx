"use client";

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import type { TableCard } from "@/lib/engine/cards";
import type { RuneUse } from "@/lib/engine/payment";
import type { EngineCost, EngineObj } from "@/lib/engine/types";
import { DOMAIN_HEX } from "@/lib/engine/told-text";
import { cn } from "@/lib/utils";

/** Au-delà de cette distance, un appui devient un glisser. */
const DRAG_PX = 8;
/** Sur écran tactile, un appui long prend la carte. */
const LONG_PRESS_MS = 320;

export type DragStart = { card: number; x: number; y: number; pointerId: number };

type HandCardProps = {
  obj: EngineObj;
  /** La carte telle que la table la dessine (une `PlayCard` sans action). */
  children: ReactNode;
  /** Le moteur permet de la jouer maintenant. */
  playable: boolean;
  /** Le bouton Jouer a été pressé : on attend l'emplacement. */
  armed: boolean;
  onPlay: () => void;
  onDragStart: (start: DragStart) => void;
  onHover: (hovered: boolean) => void;
};

/**
 * Une carte de la main : un clic la montre en grand (la `PlayCard` dedans s'en
 * charge), un glisser la joue là où on la lâche, le bouton Jouer (au survol)
 * la joue puis demande l'emplacement. Sur écran tactile, un appui long la prend.
 */
export function HandCard({ obj, children, playable, armed, onPlay, onDragStart, onHover }: HandCardProps) {
  const t = useTranslations("Games.Play");
  const press = useRef<{ x: number; y: number; id: number; timer: number | null; dragged: boolean } | null>(null);

  const start = (event: ReactPointerEvent) => {
    const p = press.current;
    if (!p || p.dragged) return;
    p.dragged = true;
    if (p.timer !== null) window.clearTimeout(p.timer);
    onDragStart({ card: obj.id, x: event.clientX, y: event.clientY, pointerId: p.id });
  };

  return (
    <div
      data-hand-card={obj.id}
      className={cn("group/hand relative", playable && "touch-pan-x")}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onPointerDown={(event) => {
        // Un nouvel appui oublie le glisser d'avant, même annulé sans clic (Échap).
        if (press.current?.timer) window.clearTimeout(press.current.timer);
        press.current = null;
        if (!playable || event.button !== 0) return;
        if ((event.target as HTMLElement).closest("[data-hand-play]")) return;
        const id = event.pointerId;
        press.current = { x: event.clientX, y: event.clientY, id, timer: null, dragged: false };
        if (event.pointerType === "touch") {
          const { clientX, clientY } = event;
          press.current.timer = window.setTimeout(() => {
            const p = press.current;
            if (!p || p.dragged) return;
            p.dragged = true;
            onDragStart({ card: obj.id, x: clientX, y: clientY, pointerId: id });
          }, LONG_PRESS_MS);
        }
      }}
      onPointerMove={(event) => {
        const p = press.current;
        if (!p || p.dragged || event.pointerId !== p.id) return;
        const dx = event.clientX - p.x;
        const dy = event.clientY - p.y;
        if (Math.hypot(dx, dy) < DRAG_PX) return;
        // Au doigt, un geste de côté fait défiler la main ; vers le haut, il prend la carte.
        if (event.pointerType === "touch" && !(dy < 0 && Math.abs(dy) > Math.abs(dx))) {
          if (p.timer !== null) window.clearTimeout(p.timer);
          press.current = null;
          return;
        }
        start(event);
      }}
      onPointerUp={() => {
        const p = press.current;
        if (p?.timer) window.clearTimeout(p.timer);
        // Après un glisser, le clic qui suit ne doit pas ouvrir l'aperçu.
        if (!p?.dragged) press.current = null;
      }}
      onPointerCancel={() => {
        const p = press.current;
        if (p?.timer) window.clearTimeout(p.timer);
        if (!p?.dragged) press.current = null;
      }}
      onClickCapture={(event) => {
        if (press.current?.dragged) {
          event.stopPropagation();
          event.preventDefault();
        }
        press.current = null;
      }}
      onContextMenu={(event) => {
        // L'appui long d'un téléphone ouvre sinon le menu de l'image.
        if (playable) event.preventDefault();
      }}
    >
      <div
        className={cn(
          "rounded-md transition",
          playable && "cursor-grab ring-2 ring-primary ring-offset-1 ring-offset-background",
          armed && "-translate-y-3 ring-2 ring-amber-400 ring-offset-2 ring-offset-background",
        )}
      >
        {children}
      </div>
      {playable && !armed && (
        <button
          type="button"
          data-hand-play
          onClick={(event) => {
            event.stopPropagation();
            onPlay();
          }}
          className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground opacity-0 shadow-lg transition focus-visible:opacity-100 group-hover/hand:opacity-100 max-lg:hidden"
        >
          {t("hand.play")}
        </button>
      )}
    </div>
  );
}

/** La carte qui suit le pointeur pendant un glisser. */
export function DragGhost({
  card,
  x,
  y,
  over,
  cost,
}: {
  card: TableCard | undefined;
  x: number;
  y: number;
  /** Au-dessus d'un emplacement permis : la carte rapetisse pour se poser. */
  over: boolean;
  cost?: EngineCost;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[70] -translate-x-1/2 -translate-y-[60%] -rotate-3 drop-shadow-2xl transition-[width] duration-100"
      style={{ left: x, top: y, width: over ? 84 : 120 }}
    >
      {card?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.image} alt="" className="w-full rounded-lg border-2 border-primary" draggable={false} />
      ) : (
        <div className="flex aspect-[5/7] w-full items-center justify-center rounded-lg border-2 border-primary bg-card p-1 text-center text-xs">
          {card?.name}
        </div>
      )}
      {cost && (
        <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2">
          <CostChips cost={cost} domains={card?.domains ?? []} />
        </div>
      )}
    </div>
  );
}

/** Le coût en pastilles : l'Énergie en rond, chaque Puissance en losange de sa couleur. */
export function CostChips({ cost, domains }: { cost: EngineCost; domains: string[] }) {
  const colorOf = (power: EngineCost["power"][number]) => {
    if (power === "Any") return "conic-gradient(#ef4444, #eab308, #22c55e, #0ea5e9, #a855f7, #ef4444)";
    const domain = power === "Card" ? domains[0]?.toLowerCase() : power.Of.toLowerCase();
    return (domain && DOMAIN_HEX[domain]) || "#94a3b8";
  };
  return (
    <span className="inline-flex items-center gap-1">
      <span className="grid size-5 place-items-center rounded-full bg-zinc-200 text-xs font-extrabold text-zinc-900">
        {cost.energy}
      </span>
      {cost.power.map((power, index) => (
        <span
          key={index}
          className="inline-block size-3.5 rotate-45 rounded-[3px] border border-black/40"
          style={{ background: colorOf(power) }}
        />
      ))}
    </span>
  );
}

/** Les marques d'une rune pendant un paiement : É épuisée, R recyclée. */
export const RUNE_MARK: Record<Exclude<RuneUse, "none">, string> = {
  exhaust: "É",
  both: "É+R",
  recycle: "R",
};
