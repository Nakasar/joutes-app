import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/db/permissions.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { getLocale } from "next-intl/server";
import type { Locale } from "@/i18n/config.ts";
import QuizForm from "../QuizForm.tsx";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Créer un quizz",
  description: "Créer un nouveau quizz",
};

export default async function CreateQuizzPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  // Écrire un quizz est ouvert à tout compte connecté. L'import par IA a son
  // propre droit : rédiger un quizz ne donne pas accès au modèle, dont chaque
  // appel est facturé.
  const canImport = await hasPermission("quizzes:ai-import").catch(() => false);

  const games = await getAllGames();
  // La VO part de la langue de l'auteur, qui reste modifiable dans le formulaire.
  const defaultLang = (await getLocale()) as Locale;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href="/quizz">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour aux quizz
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Créer un quizz</h1>
        <p className="text-muted-foreground mt-1">Créez un nouveau quizz pour la communauté</p>
      </div>

      <QuizForm
        mode="create"
        games={games}
        defaultLang={defaultLang}
        canImport={canImport}
      />
    </div>
  );
}
