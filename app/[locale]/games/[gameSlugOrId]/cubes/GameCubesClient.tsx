"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Boxes, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { CubeCard } from "@/app/[locale]/cubes/CubesClient";

type Props = {
  gameSlug: string;
  cubes: Cube[];
  /** Sans session, la création est remplacée par une invitation à se connecter. */
  canCreate: boolean;
};

export default function GameCubesClient({ gameSlug, cubes, canCreate }: Props) {
  const t = useTranslations("Games.cubes");
  const tCubes = useTranslations("Cubes");
  const router = useRouter();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // Le cube créé depuis la page d'un jeu est public par défaut : c'est le sens
  // de la page, et un cube privé y disparaîtrait aussitôt créé.
  const [visibility, setVisibility] = useState<CubeVisibility>("public");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
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
      setError(body?.error ?? tCubes("createError"));
    } catch {
      setError(tCubes("createError"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canCreate ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" />
                {tCubes("create")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{tCubes("createTitle")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1">
                  <Label htmlFor="game-cube-name">{tCubes("form.name")}</Label>
                  <Input id="game-cube-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="game-cube-description">{tCubes("form.description")}</Label>
                  <Textarea
                    id="game-cube-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={2000}
                    rows={3}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tCubes("form.visibility")}</Label>
                  <Select value={visibility} onValueChange={(value) => setVisibility(value as CubeVisibility)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">{tCubes("visibility.private")}</SelectItem>
                      <SelectItem value="unlisted">{tCubes("visibility.unlisted")}</SelectItem>
                      <SelectItem value="public">{tCubes("visibility.public")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{tCubes(`visibility.${visibility}Hint`)}</p>
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setCreateOpen(false)}>{tCubes("cancel")}</Button>
                <Button onClick={create} disabled={creating || !name.trim()} className="gap-2">
                  {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                  {tCubes("create")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Button variant="outline" asChild>
            <Link href="/login">{t("signInToCreate")}</Link>
          </Button>
        )}
      </div>

      {cubes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <Boxes className="size-10 text-muted-foreground" />
          <p className="font-semibold">{t("empty")}</p>
          <p className="text-sm text-muted-foreground">{t("emptyDescription")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cubes.map((cube) => <CubeCard key={cube.id} cube={cube} />)}
        </div>
      )}
    </div>
  );
}
