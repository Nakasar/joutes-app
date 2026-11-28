import type { Metadata } from "next";

import ClientMessages from "@/components/i18n/ClientMessages";

export const metadata: Metadata = {
  title: {
    default: "Mon compte",
    template: "%s - Mon compte",
  },
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  // Les textes que les composants client de cette section lisent (`i18n/client-messages.ts`).
  return <ClientMessages section="account">{children}</ClientMessages>;
}
