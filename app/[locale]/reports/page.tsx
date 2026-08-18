import { redirect } from "next/navigation";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * La page des signalements vit dans l'espace d'administration ; `/reports`
 * reste une adresse valide et y redirige (les droits sont vérifiés par le
 * layout admin).
 */
export default function ReportsPage() {
  redirect("/admin/reports");
}
