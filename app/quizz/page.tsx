import { getAllGames } from "@/lib/db/games";
import { hasPermission } from "@/lib/db/permissions";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Metadata } from "next";
import { HelpCircle, PenSquare } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import QuizListClient from "./QuizListClient";

export const metadata: Metadata = {
  title: "Quizz",
  description: "Tous les quizz de la communauté Joutes pour tester vos connaissances sur vos jeux de cartes à collectionner favoris.",
  keywords: ["quizz", "quiz", "jeux de cartes à collectionner", "communauté", "connaissances"],
  openGraph: {
    url: "https://joutes.app/quizz",
    siteName: "Joutes",
    title: "Quizz - Joutes",
    description: "Tous les quizz de la communauté Joutes pour tester vos connaissances sur vos jeux de cartes à collectionner favoris.",
  },
};

export const dynamic = "force-dynamic";

export default async function QuizzPage() {
  const [games, session, canManageAll] = await Promise.all([
    getAllGames(),
    auth.api.getSession({ headers: await headers() }),
    hasPermission("quizzes:update-all").catch(() => false),
  ]);

  // Écrire un quizz est ouvert à tout compte connecté ; le crayon de la liste
  // ne s'affiche en revanche que sur ses propres quizz, ou pour la modération.
  const canWrite = Boolean(session?.user);
  const currentUserId = session?.user?.id;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight flex items-center gap-2">
              <HelpCircle className="h-8 w-8 text-primary" />
              Quizz
            </h1>
            <p className="text-xl text-muted-foreground">
              Testez vos connaissances avec les quizz de la communauté
            </p>
          </div>
          {canWrite && (
            <Button asChild>
              <Link href="/quizz/create">
                <PenSquare className="h-4 w-4 mr-2" />
                Créer un quizz
              </Link>
            </Button>
          )}
        </div>

        <QuizListClient
          games={games}
          currentUserId={currentUserId}
          canManageAll={canManageAll}
        />
      </div>
    </div>
  );
}
