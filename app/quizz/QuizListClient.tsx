"use client";

import { useState, useEffect, useCallback } from "react";
import { Quiz } from "@/lib/types/Quiz";
import { Game } from "@/lib/types/Game";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Loader2, Pencil, Gamepad2, ListChecks } from "lucide-react";
import { toast } from "sonner";

type QuizListClientProps = {
  games: Game[];
  canWrite: boolean;
};

type PaginatedQuizzesResponse = {
  quizzes: Quiz[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

function countQuestions(quiz: Quiz): number {
  return quiz.blocks.reduce((sum, block) => (block.type === "form" ? sum + block.questions.length : sum), 0);
}

export default function QuizListClient({ games, canWrite }: QuizListClientProps) {
  const [data, setData] = useState<PaginatedQuizzesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [gameId, setGameId] = useState("all");

  const fetchQuizzes = useCallback(async (currentGameId: string, currentPage: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", "10");
      if (currentGameId !== "all") params.set("gameId", currentGameId);

      const res = await fetch(`/api/quizzes?${params.toString()}`);
      if (!res.ok) throw new Error("Erreur réseau");
      const result: PaginatedQuizzesResponse = await res.json();
      setData(result);
    } catch {
      toast.error("Impossible de charger les quizz");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuizzes(gameId, page);
  }, [gameId, page, fetchQuizzes]);

  const handleGameChange = (value: string) => {
    setGameId(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Filtre */}
      <div className="grid grid-cols-1 sm:max-w-xs gap-4 p-4 bg-card border rounded-lg">
        <div className="space-y-1">
          <Label className="flex items-center gap-1 text-sm">
            <Gamepad2 className="h-3.5 w-3.5" />
            Jeu
          </Label>
          <Select value={gameId} onValueChange={handleGameChange}>
            <SelectTrigger>
              <SelectValue placeholder="Tous les jeux" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les jeux</SelectItem>
              {games.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.quizzes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">Aucun quizz pour le moment.</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.quizzes.map((quiz) => {
            const questionCount = countQuestions(quiz);
            return (
              <Card key={quiz.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/quizz/${quiz.id}`} className="group">
                      <CardTitle className="text-xl group-hover:text-primary transition-colors">
                        {quiz.title}
                      </CardTitle>
                    </Link>
                    {canWrite && (
                      <Button asChild variant="ghost" size="icon" className="shrink-0">
                        <Link href={`/quizz/${quiz.id}/edit`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="flex flex-wrap gap-2">
                    {quiz.game && <Badge variant="secondary">{quiz.game.name}</Badge>}
                    <Badge variant="outline" className="gap-1">
                      <ListChecks className="h-3 w-3" />
                      {questionCount} question{questionCount === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button asChild variant="link" className="p-0 h-auto">
                    <Link href={`/quizz/${quiz.id}`}>Faire le quizz →</Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} sur {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages || isLoading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
