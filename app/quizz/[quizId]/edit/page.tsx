import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { hasPermission } from "@/lib/db/permissions";
import { getQuizById } from "@/lib/db/quizzes";
import { getAllGames } from "@/lib/db/games";
import { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import QuizForm from "../../QuizForm";

export const metadata: Metadata = {
  title: "Modifier le quizz",
};

export default async function EditQuizzPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const canWrite = await hasPermission("quizzes:update").catch(() => false);
  if (!canWrite) {
    redirect(`/quizz/${quizId}`);
  }

  const [quiz, games] = await Promise.all([getQuizById(quizId), getAllGames()]);

  if (!quiz) {
    notFound();
  }

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

      <QuizForm mode="edit" quiz={quiz} games={games} />
    </div>
  );
}
