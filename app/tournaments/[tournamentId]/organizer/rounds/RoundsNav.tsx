import Link from "next/link";
import { cn } from "@/lib/utils";

export type RoundsNavPhase = {
  phaseId: string;
  phaseName: string;
  rounds: { id: string; number: number; validated: boolean }[];
};

// Navigation / récapitulatif horizontal des rondes, groupées par phase, avec un
// lien vers chaque ronde. La ronde courante (page de détail) est surlignée.
export function RoundsNav({
  tournamentId,
  phases,
  currentRoundId,
}: {
  tournamentId: string;
  phases: RoundsNavPhase[];
  currentRoundId?: string;
}) {
  const base = `/tournaments/${tournamentId}/organizer/rounds`;

  if (phases.every((p) => p.rounds.length === 0)) {
    return <p className="text-muted-foreground">Aucune ronde jouée pour le moment.</p>;
  }

  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-1">
      {phases.map((phase) =>
        phase.rounds.length === 0 ? null : (
          <div key={phase.phaseId} className="flex shrink-0 items-center gap-2">
            <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
              {phase.phaseName}
            </span>
            {phase.rounds.map((round) => {
              const active = round.id === currentRoundId;
              return (
                <Link
                  key={round.id}
                  href={`${base}/${round.id}`}
                  aria-current={active ? "page" : undefined}
                  title={round.validated ? "Classement validé" : "Classement non validé"}
                  className={cn(
                    "whitespace-nowrap rounded-md border px-3 py-1 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card hover:bg-accent",
                    !round.validated && !active && "border-dashed text-muted-foreground"
                  )}
                >
                  R{round.number}
                </Link>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
