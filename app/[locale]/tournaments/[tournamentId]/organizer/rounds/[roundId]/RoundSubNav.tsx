import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type RoundSubSection = "matches" | "standings" | "bracket";

const SUB_SECTIONS: { key: RoundSubSection; labelKey: string; path: string }[] = [
  { key: "matches", labelKey: "rounds.tabMatches", path: "matches" },
  { key: "standings", labelKey: "rounds.tabStandings", path: "standings" },
];

const BRACKET_SECTION: { key: RoundSubSection; labelKey: string; path: string } = {
  key: "bracket",
  labelKey: "rounds.tabBracket",
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
  const t = useTranslations("Tournaments");
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
          {t(section.labelKey)}
        </Link>
      ))}
    </nav>
  );
}
