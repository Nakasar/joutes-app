import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type OrganizerSection = "settings" | "players" | "phases" | "rounds" | "live";

const SECTIONS: { key: OrganizerSection; label: string; path: string }[] = [
  { key: "settings", label: "Configuration", path: "settings" },
  { key: "players", label: "Joueurs", path: "players" },
  { key: "phases", label: "Phases", path: "phases" },
  { key: "rounds", label: "Rondes", path: "rounds" },
  { key: "live", label: "Live", path: "live" },
];

// Cadre commun aux pages du portail organisateur : en-tête, navigation entre
// les sections dédiées (pages à part entière) et liens secondaires.
export function OrganizerShell({
  tournamentId,
  tournamentName,
  active,
  children,
}: {
  tournamentId: string;
  tournamentName: string;
  active: OrganizerSection;
  children: ReactNode;
}) {
  const base = `/tournaments/${tournamentId}/organizer`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{tournamentName}</h1>
        <p className="text-muted-foreground mt-1">Portail organisateur</p>
      </div>

      <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {SECTIONS.map((section) => (
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

      {children}

      <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
        <Link href="/tournaments" className="text-sm text-muted-foreground hover:text-foreground">
          ← Mes tournois
        </Link>
        <Link
          href={`/tournaments/${tournamentId}/player`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Voir le portail joueur →
        </Link>
      </div>
    </div>
  );
}
