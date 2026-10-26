import { cn } from "@/lib/utils.ts";

/**
 * Pastille d'exemplaires possédés, posée sur une vignette de carte.
 *
 * Sans besoin (`needed`), elle dit seulement combien on en a — c'est le cas du
 * catalogue, où l'on choisit encore. Avec, elle dit si la collection suit :
 * vert quand tout est là, orange quand il en manque une partie, rouge quand on
 * n'en a aucun. La couleur double le texte, elle ne le remplace pas.
 */
export function OwnedBadge({
  owned,
  needed,
  className,
}: {
  owned: number;
  needed?: number;
  className?: string;
}) {
  const tone =
    needed === undefined
      ? owned > 0
        ? "ok"
        : "none"
      : owned >= needed
        ? "ok"
        : owned > 0
          ? "partial"
          : "missing";

  const label =
    needed === undefined
      ? `${owned} possédé${owned > 1 ? "s" : ""}`
      : `${owned} possédé${owned > 1 ? "s" : ""} sur ${needed} demandé${needed > 1 ? "s" : ""}`;

  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "pointer-events-none rounded-full border bg-background/90 px-1.5 py-px font-mono text-[10px] font-semibold leading-4",
        tone === "ok" && "border-emerald-500/70 text-emerald-600 dark:text-emerald-400",
        tone === "partial" && "border-amber-500/70 text-amber-600 dark:text-amber-400",
        tone === "missing" && "border-destructive/70 text-destructive",
        tone === "none" && "border-border text-muted-foreground",
        className
      )}
    >
      {needed === undefined ? `×${owned}` : `${owned}/${needed}`}
    </span>
  );
}
