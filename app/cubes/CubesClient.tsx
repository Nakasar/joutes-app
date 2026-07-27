"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { Boxes, Globe, Layers, Loader2, Lock, Link as LinkIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Cube, CubeVisibility } from "@/lib/types/Cube";

export const VISIBILITY_ICONS: Record<CubeVisibility, React.ReactNode> = {
  private: <Lock className="size-3.5" />,
  unlisted: <LinkIcon className="size-3.5" />,
  public: <Globe className="size-3.5" />,
};

type GameOption = { id: string; name: string; slug: string };

type Props = {
  initialCubes: Cube[];
  publicCubes: Cube[];
  games: GameOption[];
};

/**
 * Composant de module et non fonction interne au rendu : défini dans le corps
 * de la liste, il serait recréé — et la grille de cubes remontée — à chaque
 * frappe dans le formulaire de création.
 */
function CubeCard({ cube }: { cube: Cube }) {
  const t = useTranslations("Cubes");
  const locale = useLocale();

  return (
    <Link
      href={`/cubes/${cube.id}`}
      className="flex flex-col gap-2 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Boxes className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{cube.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {cube.gameName ? (
              <Badge variant="secondary" className="text-[11px]">{cube.gameName}</Badge>
            ) : null}
            <Badge variant="outline" className="gap-1 text-[11px]">
              {VISIBILITY_ICONS[cube.visibility]}
              {t(`visibility.${cube.visibility}`)}
            </Badge>
          </div>
        </div>
      </div>
      {cube.description ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">{cube.description}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Layers className="size-3.5" />
          {t("packCount", { count: cube.packsCount })}
        </span>
        <span>{t("cardCount", { count: cube.cardsCount })}</span>
        <span>{DateTime.fromJSDate(new Date(cube.updatedAt)).setLocale(locale).toLocaleString(DateTime.DATE_MED)}</span>
      </div>
    </Link>
  );
}

export default function CubesClient({ initialCubes, publicCubes, games }: Props) {
  const t = useTranslations("Cubes");
  const router = useRouter();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [gameSlug, setGameSlug] = useState(games[0]?.slug ?? "");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<CubeVisibility>("private");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim() || !gameSlug) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/cubes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          gameSlug,
          description: description.trim() || undefined,
          visibility,
        }),
      });
      if (res.ok) {
        // Les dates du corps JSON sont des chaînes : on ne type que ce qui sert.
        const cube: { id: string } = await res.json();
        router.push(`/cubes/${cube.id}`);
        return;
      }
      const body = await res.json().catch(() => null);
      setError(body?.error ?? t("createError"));
    } catch {
      setError(t("createError"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" disabled={games.length === 0}>
              <Plus className="size-4" />
              {t("create")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("createTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label htmlFor="cube-name">{t("form.name")}</Label>
                <Input id="cube-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
              </div>
              <div className="space-y-1">
                <Label>{t("form.game")}</Label>
                <Select value={gameSlug} onValueChange={setGameSlug}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("form.gamePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {games.map((game) => (
                      <SelectItem key={game.id} value={game.slug}>{game.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("form.gameHint")}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cube-description">{t("form.description")}</Label>
                <Textarea
                  id="cube-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={3}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("form.visibility")}</Label>
                <Select value={visibility} onValueChange={(value) => setVisibility(value as CubeVisibility)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">{t("visibility.private")}</SelectItem>
                    <SelectItem value="unlisted">{t("visibility.unlisted")}</SelectItem>
                    <SelectItem value="public">{t("visibility.public")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t(`visibility.${visibility}Hint`)}</p>
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>{t("cancel")}</Button>
              <Button onClick={create} disabled={creating || !name.trim() || !gameSlug} className="gap-2">
                {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("mine")}</h2>
        {initialCubes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
            <Boxes className="size-10 text-muted-foreground" />
            <p className="font-semibold">{t("emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("emptyDescription")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {initialCubes.map((cube) => <CubeCard key={cube.id} cube={cube} />)}
          </div>
        )}
      </section>

      {publicCubes.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("publicCubes")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {publicCubes.map((cube) => <CubeCard key={cube.id} cube={cube} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
