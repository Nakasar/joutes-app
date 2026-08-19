import { getPendingReportGroups } from "@/lib/db/reports.ts";
import ReportsList from "./ReportsList.tsx";
import { connection } from "next/server";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AdminReportsPage() {
  // TODO: Cache Components adoption. Added to unblock the build: remove this connection() to re-trigger the error and review the fix options.
  await connection();
  const groups = await getPendingReportGroups();

  const totalReports = groups.reduce((total, group) => total + group.count, 0);

  return (
    <div className="bg-muted/50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Contenus signalés</h1>
          <p className="text-muted-foreground mt-2">
            {groups.length === 0
              ? "Aucun signalement en attente."
              : `${groups.length} contenu${groups.length > 1 ? "s" : ""} signalé${
                  groups.length > 1 ? "s" : ""
                } pour un total de ${totalReports} signalement${totalReports > 1 ? "s" : ""}.`}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            « Ignorer » masque le signalement jusqu&apos;à ce que le contenu soit signalé de nouveau.
            « Supprimer » supprime le contenu (pour un profil, la biographie est remplacée par
            « Contenu modéré »).
          </p>
        </div>

        <ReportsList groups={groups} />
      </div>
    </div>
  );
}
