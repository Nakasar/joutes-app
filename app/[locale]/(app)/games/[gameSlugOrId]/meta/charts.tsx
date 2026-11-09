import { cn } from "@/lib/utils.ts";

export type DonutPart = { label: string; value: number; color: string };

/** Les couleurs des légendes dans les camemberts, la dernière pour « Autres ». */
export const LEGEND_COLORS = ["#0b6d9e", "#e0892b", "#2f9a5b", "#8b4fd1", "#d64545", "#62b4e0", "#b8900f", "#d977a8", "#4f7a6b"];
export const OTHERS_COLOR = "#94a3b8";

/**
 * Un camembert en anneau, dessiné en CSS (`conic-gradient`) : rien à charger.
 * Le total s'affiche au centre ; les parts sont dites aux lecteurs d'écran.
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
  let acc = 0;
  const stops = parts
    .filter((part) => part.value > 0)
    .map((part) => {
      const from = (acc / total) * 100;
      acc += part.value;
      return `${part.color} ${from.toFixed(2)}% ${((acc / total) * 100).toFixed(2)}%`;
    });
  const label = `${title} : ${parts
    .filter((part) => part.value > 0)
    .map((part) => `${part.label} ${formatShare(part.value / total)}`)
    .join(", ")}`;

  return (
    <figure className={cn("m-0 flex flex-col items-center gap-2.5", className)}>
      <div
        role="img"
        aria-label={label}
        className="flex aspect-square w-full items-center justify-center rounded-full"
        style={{ background: total > 0 ? `conic-gradient(${stops.join(", ")})` : "var(--muted)" }}
      >
        <div className="flex aspect-square w-[58%] flex-col items-center justify-center rounded-full bg-card">
          <span className="text-2xl font-bold tabular-nums">{center}</span>
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
      </div>
      <figcaption className="text-sm font-semibold">{title}</figcaption>
    </figure>
  );
}

/** La légende commune à deux camemberts : la part de chaque élément dans l'un et l'autre. */
export function DonutKey({
  rows,
  firstLabel,
  secondLabel,
}: {
  rows: { label: string; color: string; first: string; second?: string }[];
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
