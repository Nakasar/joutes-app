import Link from "next/link";
import { cn } from "@/lib/utils";

type RoundSubSection = "matches" | "standings";

const SUB_SECTIONS: { key: RoundSubSection; label: string; path: string }[] = [
  { key: "matches", label: "Matchs", path: "matches" },
  { key: "standings", label: "Classement", path: "standings" },
];

// Navigation entre les sous-pages de détail d'une ronde (matchs / classement).
export function RoundSubNav({
  tournamentId,
  roundId,
  active,
}: {
  tournamentId: string;
  roundId: string;
  active: RoundSubSection;
}) {
  const base = `/tournaments/${tournamentId}/organizer/rounds/${roundId}`;
  return (
    <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {SUB_SECTIONS.map((section) => (
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
