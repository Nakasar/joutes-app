import { Link } from "@/i18n/navigation";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import type { TournamentStatus } from "@/lib/types/Tournament";
import { OrganizerNav } from "./OrganizerNav";
import type { OrganizerNavCounts } from "./organizerContext";

/**
 * Cadre commun aux pages du portail organisateur : barre latérale d'identité et
 * de navigation, et zone de contenu pleine hauteur. Rendu par le layout du
 * segment `organizer`, il enveloppe toutes les sections sans que chaque page
 * ait à le réinstancier.
 */
export async function OrganizerShell({
  tournamentId,
  tournamentName,
  status,
  currentRoundId,
  counts,
  children,
}: {
  tournamentId: string;
  tournamentName: string;
  status: TournamentStatus;
  currentRoundId?: string;
  counts: OrganizerNavCounts;
  children: ReactNode;
}) {
  const t = await getTranslations("Tournaments");

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col lg:flex-row">
      {/* `data-print-hidden` : les pages d'impression du portail (feuilles de
          match, liste des matchs) vivent sous ce layout et se posent en
          surcouche à l'écran ; sans cela la barre latérale ressortirait sur le
          papier une fois la surcouche remise dans le flux. */}
      <aside
        data-print-hidden
        className="flex shrink-0 flex-col gap-5 border-b bg-card p-4 lg:w-[236px] lg:border-b-0 lg:border-r"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("organizerShell.tournamentLabel")}
          </p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug">{tournamentName}</p>
          <span
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              status === "in-progress"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            {status === "in-progress" && (
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            )}
            {t(`common.tournamentStatus.${status}`)}
          </span>
        </div>

        <OrganizerNav tournamentId={tournamentId} currentRoundId={currentRoundId} counts={counts} />

        <div className="mt-auto space-y-3">
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">{t("organizerShell.helpTitle")}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/80 [text-wrap:pretty]">
              {t("organizerShell.helpBody")}
            </p>
          </div>
          <div className="flex flex-col gap-1 text-xs">
            <Link href="/tournaments" className="text-muted-foreground hover:text-foreground">
              {t("organizerShell.backToTournaments")}
            </Link>
            <Link
              href={`/tournaments/${tournamentId}/player`}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("organizerShell.viewPlayerPortal")}
            </Link>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
