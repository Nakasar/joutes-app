import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Quiz } from "@/lib/types/Quiz";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListChecks } from "lucide-react";

function countQuestions(quiz: Quiz): number {
  return quiz.blocks.reduce((sum, block) => (block.type === "form" ? sum + block.questions.length : sum), 0);
}

export default async function QuizCard({ quiz }: { quiz: Quiz }) {
  const t = await getTranslations("Games.quizz");

  return (
    <Card className="hover:shadow-md transition-shadow">
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
