import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation.ts";

/**
 * Les notifications sont devenues un onglet de l'espace personnel.
 *
 * La route reste, et redirige : elle est partie dans des marque-pages et dans
 * les revalidations de `revokePushDeviceAction`. La casser n'apporterait rien
 * que des liens morts.
 */
export default async function AccountNotificationsPage() {
  redirect({ href: "/account?tab=notifications", locale: await getLocale() });
}
