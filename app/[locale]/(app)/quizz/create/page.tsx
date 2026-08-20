import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { hasPermission } from "@/lib/db/permissions.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { getLocale, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/config.ts";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import QuizForm from "../QuizForm.tsx";

export const metadata: Metadata = {
  title: "Créer un quizz",
  description: "Créer un nouveau quizz",
};

/**
 * L'en-tête ne dit rien que l'onglet ne dise déjà : il reste dans la coquille.
 * La porte — il faut un compte — et le formulaire qu'elle ouvre sont derrière
 * la frontière.
 */
export default async function CreateQuizzPage({ params }: { params: Promise<{ locale: string }> }) {
  // Le bouton de retour est un `Link` localisé, resté dans la coquille : sans
  // cet appel, next-intl relit la langue à la requête pour en composer l'adresse
  // et rend toute la route dynamique. L'appel du layout ne porte pas jusqu'ici —
  // layout et page rendent chacun de leur côté.
  const { locale } = await params;
  setRequestLocale(locale);

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

      <Suspense fallback={<EditorFormSkeleton />}>
        <CreateQuizForm />
      </Suspense>
    </div>
  );
}

async function CreateQuizForm() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  // Écrire un quizz est ouvert à tout compte connecté. L'import par IA a son
  // propre droit : rédiger un quizz ne donne pas accès au modèle, dont chaque
  // appel est facturé.
  const canImport = await hasPermission("quizzes:ai-import").catch(() => false);

  const games = await readAllGames();
  // La VO part de la langue de l'auteur, qui reste modifiable dans le formulaire.
  const defaultLang = (await getLocale()) as Locale;

  return (
    <QuizForm
      mode="create"
      games={games}
      defaultLang={defaultLang}
      canImport={canImport}
    />
  );
}
