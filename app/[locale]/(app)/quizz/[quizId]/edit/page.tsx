import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { hasPermission } from "@/lib/db/permissions.ts";
import { getQuizById } from "@/lib/db/quizzes.ts";
import { canManageQuiz } from "@/lib/quizzes/authorization.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import QuizForm from "../../QuizForm.tsx";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Modifier le quizz",
};

export default async function EditQuizzPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const [quiz, games] = await Promise.all([getQuizById(quizId), getAllGames()]);

  if (!quiz) {
    notFound();
  }

  // Son auteur, ou la modération : modifier le quizz de quelqu'un d'autre
  // demande `quizzes:update-all`.
  const canWrite = await canManageQuiz(quiz, session.user.id).catch(() => false);
  if (!canWrite) {
    redirect(`/quizz/${quizId}`);
  }

  // L'import par IA a son propre droit : rédiger un quizz ne donne pas accès au
  // modèle, dont chaque appel est facturé.
  const canImport = await hasPermission("quizzes:ai-import").catch(() => false);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href={`/quizz/${quizId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour au quizz
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Modifier le quizz</h1>
      </div>

      <QuizForm mode="edit" quiz={quiz} games={games} canImport={canImport} />
    </div>
  );
}
