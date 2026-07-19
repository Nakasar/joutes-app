import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/db/permissions";
import { getAllGames } from "@/lib/db/games";
import { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import QuizForm from "../QuizForm";

export const metadata: Metadata = {
  title: "Créer un quizz",
  description: "Créer un nouveau quizz",
};

export default async function CreateQuizzPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const canWrite = await hasPermission("quizzes:update").catch(() => false);
  if (!canWrite) {
    redirect("/quizz");
  }

  const games = await getAllGames();

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

      <QuizForm mode="create" games={games} />
    </div>
  );
}
