import type { GameCardSummary } from "@/lib/db/cards.ts";

/**
 * Origine d'une carte : ajoutée à la main depuis cet écran, ou issue d'un
 * script d'import — les cartes importées avant l'ajout du champ `source` ne le
 * portent pas et sont donc affichées comme importées —, et marquage d'une
 * éventuelle retouche manuelle.
 */
export default function CardOriginBadges({ card }: { card: Pick<GameCardSummary, "source" | "manuallyEditedAt"> }) {
  return (
    <span className="flex flex-wrap items-center gap-1 text-[11px]">
      <span
        className={`rounded-full px-2 py-0.5 ${
          card.source === "manual" ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "bg-muted text-muted-foreground"
        }`}
      >
        {card.source === "manual" ? "Manuelle" : "Importée"}
      </span>
      {card.manuallyEditedAt && (
        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">Modifiée</span>
      )}
    </span>
  );
}
