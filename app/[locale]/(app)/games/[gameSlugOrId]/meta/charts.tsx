import { cn } from "@/lib/utils.ts";

/**
 * Une part de camembert. `colors` (deux couleurs ou plus) la peint en dégradé
 * du bord intérieur de l'anneau (première couleur) au bord extérieur (dernière),
 * à la place de `color`.
 */
export type DonutPart = { label: string; value: number; color: string; colors?: string[] };

/** Un fond CSS pour une liste de couleurs : pleine s'il n'y en a qu'une, en dégradé du centre vers le bord sinon. */
export function swatchBackground(colors: string[], fallback: string): string {
  if (colors.length === 0) return fallback;
  return colors.length === 1 ? colors[0] : `radial-gradient(circle, ${colors.join(", ")})`;
}

/** Les couleurs des légendes dans les camemberts, la dernière pour « Autres ». */
export const LEGEND_COLORS = ["#0b6d9e", "#e0892b", "#2f9a5b", "#8b4fd1", "#d64545", "#62b4e0", "#b8900f", "#d977a8", "#4f7a6b"];
export const OTHERS_COLOR = "#94a3b8";

/** Le trou de l'anneau, en part du diamètre (le cercle central fait `w-[58%]`). */
const HOLE = 58;

/**
 * Un camembert en anneau, dessiné en CSS (`conic-gradient`) : rien à charger.
 * Le total s'affiche au centre ; les parts sont dites aux lecteurs d'écran.
 *
 * Une part en dégradé (`colors`) passe d'une couleur à l'autre en s'éloignant
 * du centre : un calque conique par couleur, chacun estompé vers l'extérieur
 * par un masque radial au-dessus du suivant. Les parts voisines ne se touchent
 * ainsi jamais par un dégradé.
 */
export function Donut({
  title,
  center,
  unit,
  parts,
  className,
  formatShare,
}: {
  title: string;
  center: string;
  unit: string;
  parts: DonutPart[];
  className?: string;
  formatShare: (share: number) => string;
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const shown = parts.filter((part) => part.value > 0);
  const layers = Math.max(1, ...shown.map((part) => part.colors?.length ?? 1));
  // Entre deux dégradés, un mince trait sépare les parts.
  const gap = shown.length > 1 && layers > 1 ? 0.6 : 0;
  const conic = (layer: number) => {
    let acc = 0;
    const stops = shown.map((part) => {
      const start = (acc / total) * 100;
      acc += part.value;
      const to = (acc / total) * 100;
      const from = Math.min(start + gap, to);
      const colors = part.colors && part.colors.length > 0 ? part.colors : [part.color];
      const color = colors[Math.min(layer, colors.length - 1)];
      const separator = gap > 0 ? `var(--card) ${start.toFixed(2)}% ${from.toFixed(2)}%, ` : "";
      return `${separator}${color} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  };
  // Le rayon (en part du rayon extérieur) où la couleur n° `layer` est pure.
  const radius = (layer: number) => HOLE + ((100 - HOLE) * layer) / Math.max(1, layers - 1);
  const label = `${title} : ${shown.map((part) => `${part.label} ${formatShare(part.value / total)}`).join(", ")}`;

  return (
    <figure className={cn("m-0 flex flex-col items-center gap-2.5", className)}>
      <div
        role="img"
        aria-label={label}
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-full"
        style={{ background: total > 0 ? conic(layers - 1) : "var(--muted)" }}
      >
        {total > 0 &&
          Array.from({ length: layers - 1 }, (_, index) => layers - 2 - index).map((layer) => {
            const mask = `radial-gradient(closest-side, #000 ${radius(layer).toFixed(1)}%, transparent ${radius(layer + 1).toFixed(1)}%)`;
            return (
              <span
                key={layer}
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{ background: conic(layer), maskImage: mask, WebkitMaskImage: mask }}
              />
            );
          })}
        <div className="relative flex aspect-square w-[58%] flex-col items-center justify-center rounded-full bg-card">
          <span className="text-2xl font-bold tabular-nums">{center}</span>
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
      </div>
      <figcaption className="text-sm font-semibold">{title}</figcaption>
    </figure>
  );
}

/**
 * La vignette d'une légende, posée à côté de son nom. Sans image, une case
 * grise garde l'alignement.
 */
export function LegendThumb({ src, className }: { src?: string; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className={cn("h-8 w-6 shrink-0 rounded-sm object-cover object-top", className)} />
  ) : (
    <span className={cn("h-8 w-6 shrink-0 rounded-sm bg-muted", className)} aria-hidden />
  );
}

/** La légende commune à deux camemberts : la part de chaque élément dans l'un et l'autre. */
export function DonutKey({
  rows,
  firstLabel,
  secondLabel,
}: {
  /** `withThumb` ajoute la vignette `image` (ou une case vide) après la couleur. */
  rows: { label: string; color: string; first: string; second?: string; image?: string; withThumb?: boolean }[];
  firstLabel: string;
  secondLabel?: string;
}) {
  const columns = secondLabel ? "grid-cols-[minmax(0,1fr)_3.5rem_3.5rem]" : "grid-cols-[minmax(0,1fr)_3.5rem]";
  return (
    <div className="flex min-w-0 flex-col text-sm">
      <div className={cn("grid gap-2 pb-1.5 text-xs text-muted-foreground", columns)}>
        <span />
        <span className="text-right">{firstLabel}</span>
        {secondLabel && <span className="text-right">{secondLabel}</span>}
      </div>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li key={row.label} className={cn("grid items-center gap-2 border-t border-border py-1.5", columns)}>
            <span className="flex min-w-0 items-center gap-2 font-medium">
              <span className="size-3 shrink-0 rounded-sm" style={{ background: row.color }} aria-hidden />
              {row.withThumb && <LegendThumb src={row.image} className="h-7 w-5" />}
              <span className="truncate">{row.label}</span>
            </span>
            <span className="text-right font-mono tabular-nums">{row.first}</span>
            {secondLabel && <span className="text-right font-mono text-muted-foreground tabular-nums">{row.second}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
