import Link from "next/link";
import { cn } from "@/lib/utils";

type RoundSubSection = "matches" | "standings" | "bracket";

const SUB_SECTIONS: { key: RoundSubSection; label: string; path: string }[] = [
  { key: "matches", label: "Matchs", path: "matches" },
  { key: "standings", label: "Classement", path: "standings" },
];

const BRACKET_SECTION: { key: RoundSubSection; label: string; path: string } = {
  key: "bracket",
  label: "Arbre",
  path: "bracket",
};

// Navigation entre les sous-pages de détail d'une ronde (matchs / classement,
// plus l'arbre pour les phases en arbre d'élimination).
export function RoundSubNav({
  tournamentId,
  roundId,
  active,
  showBracket = false,
}: {
  tournamentId: string;
  roundId: string;
  active: RoundSubSection;
  showBracket?: boolean;
}) {
  const base = `/tournaments/${tournamentId}/organizer/rounds/${roundId}`;
  const sections = showBracket ? [...SUB_SECTIONS, BRACKET_SECTION] : SUB_SECTIONS;
  return (
    <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {sections.map((section) => (
        <Link
          key={section.key}
          href={`${base}/${section.path}`}
          aria-current={active === section.key ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            active === section.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
