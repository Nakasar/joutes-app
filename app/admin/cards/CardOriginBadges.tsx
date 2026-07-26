import type { GameCardSummary } from "@/lib/db/cards";

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
          card.source === "manual" ? "bg-indigo-50 text-indigo-700" : "bg-gray-100 text-gray-600"
        }`}
      >
        {card.source === "manual" ? "Manuelle" : "Importée"}
      </span>
      {card.manuallyEditedAt && (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">Modifiée</span>
      )}
    </span>
  );
}
