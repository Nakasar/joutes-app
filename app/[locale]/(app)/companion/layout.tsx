import ClientMessages from "@/components/i18n/ClientMessages";

/** Les textes que les composants client de cette section lisent (`i18n/client-messages.ts`). */
export default function CompanionLayout({ children }: { children: React.ReactNode }) {
  return <ClientMessages section="companion">{children}</ClientMessages>;
}
