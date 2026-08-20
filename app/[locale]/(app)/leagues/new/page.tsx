import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Metadata } from "next";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { getAllLairs } from "@/lib/db/lairs.ts";
import { Link } from "@/i18n/navigation.ts";
import { setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button.tsx";
import { ArrowLeft } from "lucide-react";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import LeagueForm from "./LeagueForm.tsx";

export const metadata: Metadata = {
  title: "Créer une ligue",
  description: "Créer une nouvelle ligue ou tournoi",
};

/**
 * L'en-tête ne dit rien que l'onglet ne dise déjà : il reste dans la coquille.
 * La porte — il faut un compte — et le formulaire qu'elle ouvre sont derrière
 * la frontière.
 */
export default async function NewLeaguePage({ params }: { params: Promise<{ locale: string }> }) {
  // Le bouton de retour est un `Link` localisé, resté dans la coquille : sans
  // cet appel, next-intl relit la langue à la requête pour en composer
  // l'adresse et rend toute la route dynamique.
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/leagues">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">Nouvelle ligue</h1>
        </div>

        <Suspense fallback={<EditorFormSkeleton fields={4} />}>
          <NewLeagueForm />
        </Suspense>
      </div>
    </div>
  );
}

async function NewLeagueForm() {
  // Le pilote Mongo touche à l'horloge en lisant les lairs, ce qu'un prérendu
  // ne sait pas figer, et aucune frontière n'y change rien.
  await connection();

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const [games, lairs] = await Promise.all([
    readAllGames(),
    getAllLairs(session.user.id),
  ]);

  return <LeagueForm games={games} lairs={lairs} />;
}
