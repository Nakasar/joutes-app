import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type OrganizerSection = "settings" | "players" | "phases" | "rounds" | "live";

const SECTIONS: { key: OrganizerSection; path: string }[] = [
  { key: "settings", path: "settings" },
  { key: "players", path: "players" },
  { key: "phases", path: "phases" },
  { key: "rounds", path: "rounds" },
  { key: "live", path: "live" },
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
  const t = useTranslations("Tournaments");
  const base = `/tournaments/${tournamentId}/organizer`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{tournamentName}</h1>
        <p className="text-muted-foreground mt-1">{t("organizerShell.subtitle")}</p>
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
            {t(`organizerShell.sections.${section.key}`)}
          </Link>
        ))}
      </nav>

      {children}

      <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
        <Link href="/tournaments" className="text-sm text-muted-foreground hover:text-foreground">
          {t("organizerShell.backToTournaments")}
        </Link>
        <Link
          href={`/tournaments/${tournamentId}/player`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t("organizerShell.viewPlayerPortal")}
        </Link>
      </div>
    </div>
  );
}
