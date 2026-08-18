import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { FileSpreadsheet, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sorties papier et tableur des matchs. Sur une ronde (`roundId` fourni), les
 * feuilles de match de la ronde s'ajoutent à la liste ; au niveau du tournoi,
 * seule la liste complète a du sens.
 */
export function MatchExportActions({
  tournamentId,
  roundId,
}: {
  tournamentId: string;
  roundId?: string;
}) {
  const t = useTranslations("Tournaments");

  const base = `/tournaments/${tournamentId}/organizer`;
  const listHref = roundId
    ? `${base}/matches/print?roundId=${encodeURIComponent(roundId)}`
    : `${base}/matches/print`;
  const csvHref = roundId
    ? `/api/tournaments/${tournamentId}/matches/export?roundId=${encodeURIComponent(roundId)}`
    : `/api/tournaments/${tournamentId}/matches/export`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {roundId ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={`${base}/rounds/${roundId}/matches/print`}>
            <Printer className="size-4" />
            {t("matchExport.sheetsButton")}
          </Link>
        </Button>
      ) : null}
      <Button variant="outline" size="sm" asChild>
        <Link href={listHref}>
          <FileText className="size-4" />
          {t("matchExport.listButton")}
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild>
        {/* Téléchargement direct : la route renvoie le CSV en pièce jointe. */}
        <a href={csvHref} download>
          <FileSpreadsheet className="size-4" />
          {t("matchExport.csvButton")}
        </a>
      </Button>
    </div>
  );
}
