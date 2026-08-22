import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation.ts";

export const metadata: Metadata = {
  title: "Mon abonnement",
  robots: { index: false, follow: false },
};

/**
 * L'abonnement est devenu un onglet de l'espace personnel.
 *
 * La route reste, et redirige : elle est partie dans des marque-pages, dans le
 * retour de la liaison Patreon et dans les revalidations de l'administration.
 * La casser n'apporterait rien que des liens morts.
 */
export default async function SubscriptionPage() {
  redirect({ href: "/account?tab=subscription", locale: await getLocale() });
}
