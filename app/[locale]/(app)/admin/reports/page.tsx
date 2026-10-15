import { getPendingReportGroups } from "@/lib/db/reports.ts";
import ReportsTriage from "./ReportsTriage.tsx";
import { connection } from "next/server";
import { AdminPage } from "../_components/AdminPage.tsx";

export default async function AdminReportsPage() {
  // Le pilote Mongo touche à l'horloge en chemin, ce qu'un prérendu ne sait
  // pas figer. Vérifié en le retirant : la route redevient bloquante.
  await connection();
  const groups = await getPendingReportGroups();

  const totalReports = groups.reduce((total, group) => total + group.count, 0);

  return (
    <AdminPage
      title="Signalements"
      description={
        groups.length === 0
          ? "Aucun contenu en attente."
          : `${groups.length} contenu${groups.length > 1 ? "s" : ""} à examiner, ${totalReports} signalement${
              totalReports > 1 ? "s" : ""
            } au total. Les plus signalés passent en premier.`
      }
    >
      <ReportsTriage groups={groups} />
    </AdminPage>
  );
}
