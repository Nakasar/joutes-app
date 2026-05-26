"use client";

import { useState, useEffect, useCallback } from "react";
import { News } from "@/lib/types/News";
import { Game } from "@/lib/types/Game";
import Link from "next/link";
import { DateTime } from "luxon";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Heart,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Calendar,
  Tag,
  Gamepad2,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

type NewsListClientProps = {
  games: Game[];
  tags: string[];
  userId?: string;
  canWrite: boolean;
};

type PaginatedNewsResponse = {
  news: News[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type Filters = {
  gameId: string;
  tag: string;
  dateFrom: string;
  dateTo: string;
};

export default function NewsListClient({ games, tags, userId, canWrite }: NewsListClientProps) {
  const [data, setData] = useState<PaginatedNewsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({
    gameId: "all",
    tag: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set());

  const fetchNews = useCallback(async (currentFilters: Filters, currentPage: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", "10");
      if (currentFilters.gameId !== "all") params.set("gameId", currentFilters.gameId);
      if (currentFilters.tag !== "all") params.set("tag", currentFilters.tag);
      if (currentFilters.dateFrom) params.set("dateFrom", currentFilters.dateFrom);
      if (currentFilters.dateTo) params.set("dateTo", currentFilters.dateTo);

      const res = await fetch(`/api/news?${params.toString()}`);
      if (!res.ok) throw new Error("Erreur réseau");
      const result: PaginatedNewsResponse = await res.json();
      setData(result);
    } catch {
      toast.error("Impossible de charger les actualités");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews(filters, page);
  }, [filters, page, fetchNews]);

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleLike = async (newsId: string) => {
    if (!userId) {
      toast.error("Vous devez être connecté pour aimer une actualité");
      return;
    }
    if (likingIds.has(newsId)) return;

    setLikingIds((prev) => new Set(prev).add(newsId));
    try {
      const res = await fetch(`/api/news/${newsId}/like`, { method: "POST" });
      if (!res.ok) throw new Error();
      const { liked, likesCount }: { liked: boolean; likesCount: number } = await res.json();

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          news: prev.news.map((n) =>
            n.id === newsId ? { ...n, userHasLiked: liked, likesCount } : n
          ),
        };
      });
    } catch {
      toast.error("Erreur lors du like");
    } finally {
      setLikingIds((prev) => {
        const next = new Set(prev);
        next.delete(newsId);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Filtres */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-card border rounded-lg">
        <div className="space-y-1">
          <Label className="flex items-center gap-1 text-sm">
            <Gamepad2 className="h-3.5 w-3.5" />
            Jeu
          </Label>
          <Select
            value={filters.gameId}
            onValueChange={(v) => handleFilterChange("gameId", v)}
          >
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

        <div className="space-y-1">
          <Label className="flex items-center gap-1 text-sm">
            <Tag className="h-3.5 w-3.5" />
            Tag
          </Label>
          <Select
            value={filters.tag}
            onValueChange={(v) => handleFilterChange("tag", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tous les tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="flex items-center gap-1 text-sm">
            <Calendar className="h-3.5 w-3.5" />
            Depuis le
          </Label>
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label className="flex items-center gap-1 text-sm">
            <Calendar className="h-3.5 w-3.5" />
            Jusqu&apos;au
          </Label>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleFilterChange("dateTo", e.target.value)}
          />
        </div>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.news.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          Aucune actualité pour le moment.
        </div>
      ) : (
        <div className="space-y-4">
          {data.news.map((item) => (
            <NewsCard
              key={item.id}
              news={item}
              canWrite={canWrite}
              isLiking={likingIds.has(item.id)}
              onLike={() => handleLike(item.id)}
            />
          ))}
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

type NewsCardProps = {
  news: News;
  canWrite: boolean;
  isLiking: boolean;
  onLike: () => void;
};

function NewsCard({ news, canWrite, isLiking, onLike }: NewsCardProps) {
  const date = DateTime.fromJSDate(new Date(news.createdAt)).setLocale("fr").toLocaleString(DateTime.DATE_FULL);
  const authorName =
    news.author?.displayName && news.author?.discriminator
      ? `${news.author.displayName}#${news.author.discriminator}`
      : "Auteur inconnu";

  return (
    <Card className="hover:shadow-md transition-shadow overflow-hidden">
      {news.banner && (
        <div className="relative w-full aspect-[3/1] max-h-48">
          <Image
            src={news.banner}
            alt={`Bannière : ${news.title}`}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      )}
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/news/${news.id}`} className="group">
            <CardTitle className="text-xl group-hover:text-primary transition-colors">
              {news.title}
            </CardTitle>
          </Link>
          {canWrite && (
            <Button asChild variant="ghost" size="icon" className="shrink-0">
              <Link href={`/news/${news.id}/edit`}>
                <Pencil className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{date}</span>
          <span>·</span>
          <span>{authorName}</span>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <p className="text-muted-foreground line-clamp-3">{news.summary}</p>

        <div className="flex flex-wrap gap-2 mt-3">
          {news.games?.map((g) => (
            <Badge key={g.id} variant="secondary">
              {g.name}
            </Badge>
          ))}
          {news.tags.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between pt-0">
        <Link href={`/news/${news.id}`}>
          <Button variant="link" className="p-0 h-auto">
            Lire la suite →
          </Button>
        </Link>

        <button
          onClick={onLike}
          disabled={isLiking}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
        >
          <Heart
            className={`h-4 w-4 ${news.userHasLiked ? "fill-red-500 text-red-500" : ""}`}
          />
          <span>{news.likesCount}</span>
        </button>
      </CardFooter>
    </Card>
  );
}
