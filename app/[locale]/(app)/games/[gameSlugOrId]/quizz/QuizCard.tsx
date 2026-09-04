import { Link } from "@/i18n/navigation.ts";
import { getTranslations } from "next-intl/server";
import { Quiz } from "@/lib/types/Quiz.ts";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { QuizCoverImage } from "@/components/quizzes/QuizCoverImage.tsx";
import { resolveQuizCover } from "@/lib/quizzes/cover.ts";
import { cn } from "@/lib/utils.ts";
import { ListChecks } from "lucide-react";

function countQuestions(quiz: Quiz): number {
  return quiz.blocks.reduce((sum, block) => (block.type === "form" ? sum + block.questions.length : sum), 0);
}

export default async function QuizCard({ quiz }: { quiz: Quiz }) {
  const t = await getTranslations("Games.quizz");

  // La couverture est facultative : sans elle, la carte reste celle d'avant.
  // C'est aussi pourquoi la marge du haut ne tombe que lorsqu'il y a une image
  // à y coller — la retirer sans image décollerait le titre du bord.
  const cover = resolveQuizCover(quiz);

  return (
    <Card className={cn("hover:shadow-md transition-shadow overflow-hidden", cover.image && "pt-0")}>
      <QuizCoverImage cover={cover} title={quiz.title} className="aspect-[16/7] w-full" />

      <CardHeader className="pb-2">
        <Link href={`/quizz/${quiz.id}`} className="group">
          <CardTitle className="text-xl group-hover:text-primary transition-colors">{quiz.title}</CardTitle>
        </Link>
      </CardHeader>

      <CardContent className="pb-3">
        <Badge variant="outline" className="gap-1">
          <ListChecks className="h-3 w-3" />
          {t("questionsCount", { count: countQuestions(quiz) })}
        </Badge>
      </CardContent>

      <CardFooter>
        <Button asChild variant="link" className="p-0 h-auto">
          <Link href={`/quizz/${quiz.id}`}>{t("play")}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
