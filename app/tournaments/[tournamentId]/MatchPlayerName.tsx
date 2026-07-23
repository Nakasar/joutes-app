import type { ReactNode } from "react";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Nom d'un joueur dans un résultat de match. Le vainqueur est mis en avant dans
 * un badge doré.
 */
export function MatchPlayerName({
  name,
  isWinner,
  className,
}: {
  name: ReactNode;
  isWinner: boolean;
  className?: string;
}) {
  if (!isWinner) {
    return <span className={className}>{name}</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-amber-400/70 bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200",
        className
      )}
    >
      <Trophy className="h-3 w-3 shrink-0" />
      {name}
    </span>
  );
}
