import { redirect } from "@/i18n/navigation.ts";
import { getLocale } from "next-intl/server";

/**
 * Les succès sont devenus un onglet de l'espace personnel.
 *
 * La route reste, et redirige : elle est partie dans des marque-pages, dans le
 * menu du compte, et dans les revalidations de l'administration. La casser
 * n'apporterait rien que des liens morts.
 */
export default async function AchievementsPage() {
  redirect({ href: "/account?tab=achievements", locale: await getLocale() });
}
