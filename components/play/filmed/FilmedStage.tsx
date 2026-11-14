"use client";

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";

import { areaAt } from "@/lib/filmed/layout";
import type { Area, Found, Layout, Point } from "@/lib/filmed/types";
import { cn } from "@/lib/utils";

/** Les couleurs des deux joueurs, celles de la table de jeu. */
export const SEAT_COLORS = ["#2bb7dc", "#e0566b"];
export const DOUBT_COLOR = "#fbbf24";
const NEUTRAL = "rgb(255 255 255 / 0.7)";

export function areaColor(area: Area | null): string {
  if (!area || area.kind === "battlefield") return NEUTRAL;
  return SEAT_COLORS[area.index] ?? NEUTRAL;
}

type Grip = { area: number; mode: "move" | "nw" | "ne" | "sw" | "se"; from: Point; rect: Area["rect"] };

type FilmedStageProps = {
  video: RefObject<HTMLVideoElement | null>;
  /** La taille de l'image de la source, connue une fois la vidéo ouverte. */
  size: { width: number; height: number } | null;
  layout: Layout | null;
  /** Donné : les zones se déplacent et se redimensionnent à la souris ou au doigt. */
  onLayout?: (layout: Layout) => void;
  found: Found[];
  showFrames: boolean;
  showZones: boolean;
  /** Les commandes du lecteur (choisir l'instant de départ d'une vidéo). */
  controls: boolean;
  cardName: (id: string) => string;
  areaLabel: (area: Area) => string;
  /** Sans source : ce qu'on montre à la place de l'image. */
  empty: ReactNode;
  children?: ReactNode;
  className?: string;
};

/** Une zone garde au moins cette taille, en pixels de l'image. */
const MIN_ZONE = 60;

/**
 * L'image de la caméra ou de la vidéo, et ce que la lecture y a trouvé : les
 * zones de la table, un cadre par carte reconnue.
 */
export function FilmedStage({
  video,
  size,
  layout,
  onLayout,
  found,
  showFrames,
  showZones,
  controls,
  cardName,
  areaLabel,
  empty,
  children,
  className,
}: FilmedStageProps) {
  const svg = useRef<SVGSVGElement | null>(null);
  const grip = useRef<Grip | null>(null);

  function toImage(event: ReactPointerEvent): Point {
    const box = svg.current?.getBoundingClientRect();
    if (!box || !size) return [0, 0];
    return [((event.clientX - box.left) / box.width) * size.width, ((event.clientY - box.top) / box.height) * size.height];
  }

  /** Une zone ou l'un de ses coins porte `data-area` et `data-grip` : c'est là qu'on la saisit. */
  function grab(event: ReactPointerEvent) {
    const held = (event.target as Element).closest<SVGElement>("[data-grip]");
    if (!held || !layout || !onLayout) return;
    const area = Number(held.dataset.area);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    grip.current = { area, mode: held.dataset.grip as Grip["mode"], from: toImage(event), rect: layout.areas[area].rect };
  }

  function drag(event: ReactPointerEvent) {
    const held = grip.current;
    if (!held || !layout || !onLayout || !size) return;
    const [px, py] = toImage(event);
    const dx = px - held.from[0];
    const dy = py - held.from[1];
    let [x, y, w, h] = held.rect;
    if (held.mode === "move") {
      x = Math.min(Math.max(0, x + dx), size.width - w);
      y = Math.min(Math.max(0, y + dy), size.height - h);
    } else {
      // Le coin opposé ne bouge pas.
      const left = held.mode === "nw" || held.mode === "sw";
      const top = held.mode === "nw" || held.mode === "ne";
      const x2 = x + w;
      const y2 = y + h;
      if (left) x = Math.min(Math.max(0, x + dx), x2 - MIN_ZONE);
      else w = Math.min(Math.max(MIN_ZONE, w + dx), size.width - x);
      if (top) y = Math.min(Math.max(0, y + dy), y2 - MIN_ZONE);
      else h = Math.min(Math.max(MIN_ZONE, h + dy), size.height - y);
      if (left) w = x2 - x;
      if (top) h = y2 - y;
    }
    const rect = [x, y, w, h].map(Math.round) as Area["rect"];
    onLayout({ ...layout, areas: layout.areas.map((area, index) => (index === held.area ? { ...area, rect } : area)) });
  }

  function release() {
    grip.current = null;
  }

  // Les textes de l'incrustation suivent la taille de l'image, pas celle de l'écran.
  const unit = size ? size.width / 100 : 10;

  return (
    <section
      className={cn("relative overflow-hidden rounded-2xl border bg-black text-white", className)}
      style={{ aspectRatio: size ? `${size.width} / ${size.height}` : "16 / 9" }}
    >
      <video ref={video} playsInline muted controls={controls} className="absolute inset-0 size-full" />
      {!size && <div className="absolute inset-0 flex items-center justify-center p-6 text-center">{empty}</div>}
      {size && layout && (
        <svg
          ref={svg}
          viewBox={`0 0 ${size.width} ${size.height}`}
          preserveAspectRatio="none"
          className={cn("absolute inset-0 size-full touch-none", !onLayout && "pointer-events-none")}
          // Les commandes du lecteur restent atteignables sous l'incrustation.
          style={controls ? { height: "calc(100% - 3.5rem)" } : undefined}
          onPointerDown={grab}
          onPointerMove={drag}
          onPointerUp={release}
          onPointerCancel={release}
        >
          {showZones &&
            layout.areas.map((area, index) => {
              const [x, y, w, h] = area.rect;
              const color = areaColor(area);
              return (
                <g key={`${area.kind}-${area.index}`}>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={unit * 0.6}
                    fill={onLayout ? "rgb(255 255 255 / 0.04)" : "none"}
                    stroke={color}
                    strokeWidth={unit * 0.14}
                    strokeDasharray={`${unit * 0.8} ${unit * 0.6}`}
                    className={onLayout ? "cursor-move" : undefined}
                    data-area={index}
                    data-grip="move"
                  />
                  <text
                    x={x + unit * 0.7}
                    y={y + unit * 1.6}
                    fontSize={unit * 1.05}
                    fill={color}
                    stroke="rgb(0 0 0 / 0.75)"
                    strokeWidth={unit * 0.3}
                    paintOrder="stroke"
                    className="pointer-events-none font-mono uppercase"
                  >
                    {areaLabel(area)}
                  </text>
                  {onLayout &&
                    (["nw", "ne", "sw", "se"] as const).map((corner) => (
                      <circle
                        key={corner}
                        cx={corner.endsWith("w") ? x : x + w}
                        cy={corner.startsWith("n") ? y : y + h}
                        r={unit * 0.9}
                        fill={color}
                        stroke="#04121b"
                        strokeWidth={unit * 0.25}
                        className={corner === "nw" || corner === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"}
                        data-area={index}
                        data-grip={corner}
                      />
                    ))}
                </g>
              );
            })}
          {showFrames &&
            found.map((card, index) => {
              const color = card.sure ? areaColor(areaAt(layout, card.at)) : DOUBT_COLOR;
              const top = card.quad.reduce((best, point) => (point[1] < best[1] ? point : best), card.quad[0]);
              const left = Math.min(...card.quad.map((point) => point[0]));
              return (
                <g key={`${card.id}-${index}`} className="pointer-events-none">
                  <polygon
                    points={card.quad.map((point) => point.join(",")).join(" ")}
                    fill="none"
                    stroke={color}
                    strokeWidth={unit * 0.22}
                    strokeDasharray={card.sure ? undefined : `${unit * 0.7} ${unit * 0.5}`}
                    strokeLinejoin="round"
                  />
                  <text
                    x={left}
                    y={top[1] - unit * 0.5}
                    fontSize={unit * 1}
                    fontWeight={600}
                    fill={color}
                    stroke="rgb(0 0 0 / 0.8)"
                    strokeWidth={unit * 0.32}
                    paintOrder="stroke"
                  >
                    {cardName(card.id)}
                    {card.sure ? "" : " ?"}
                  </text>
                </g>
              );
            })}
        </svg>
      )}
      {children}
    </section>
  );
}
