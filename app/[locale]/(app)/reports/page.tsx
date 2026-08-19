import { redirect } from "next/navigation";

/**
 * La page des signalements vit dans l'espace d'administration ; `/reports`
 * reste une adresse valide et y redirige (les droits sont vérifiés par le
 * layout admin).
 */
export default function ReportsPage() {
  redirect("/admin/reports");
}
