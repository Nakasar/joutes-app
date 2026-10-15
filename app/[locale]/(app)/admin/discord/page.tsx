import type { Metadata } from "next";
import { Button } from "@/components/ui/button.tsx";
import { registerDiscordCommands } from "./actions.ts";
import { AdminPage, AdminPanel } from "../_components/AdminPage.tsx";

export const metadata: Metadata = {
  title: "Admin — Discord",
  description: "Administration des commandes Discord Joutes Tools.",
  robots: { index: false, follow: false },
};

export default function AdminDiscordPage() {
  return (
    <AdminPage
      title="Discord"
      description={<p>Administration des commandes Discord Joutes Tools.</p>}
      width="narrow"
    >
      <AdminPanel className="flex flex-col items-start gap-4 p-6">
        <p className="text-sm text-muted-foreground">
          Réenregistre auprès de Discord les commandes slash du bot, après en avoir ajouté ou modifié une.
        </p>
        <Button onClick={registerDiscordCommands}>Mettre à jour les commandes</Button>
      </AdminPanel>
    </AdminPage>
  );
}