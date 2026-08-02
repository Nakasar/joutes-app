"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  Dices,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { CubeAttributeOption } from "@/lib/db/cube-draw";
import type { Cube, CubeDrawConfig, CubePack, CubeVisibility } from "@/lib/types/Cube";
import { VISIBILITY_ICONS } from "../CubesClient";
import ExportCardListDialog from "../ExportCardListDialog";
import DrawSettingsDialog from "./DrawSettingsDialog";

type Props = {
  cube: Cube;
  packs: CubePack[];
  canEdit: boolean;
  ownerLabel?: string;
  ownerHref?: string;
  drawConfig: CubeDrawConfig;
  /** Vide pour les visiteurs : les options ne servent qu'à la configuration. */
  attributeOptions: CubeAttributeOption[];
};

export default function CubeDetailClient({
  cube,
  packs,
  canEdit,
  ownerLabel,
  ownerHref,
  drawConfig,
  attributeOptions,
}: Props) {
  const t = useTranslations("Cubes");
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(cube.name);
  const [description, setDescription] = useState(cube.description ?? "");
  const [visibility, setVisibility] = useState<CubeVisibility>(cube.visibility);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [packOpen, setPackOpen] = useState(false);
  const [packName, setPackName] = useState("");
  const [packType, setPackType] = useState("");
  const [creatingPack, setCreatingPack] = useState(false);

  // Les suppressions passent par une confirmation : elles emportent les cartes
  // du paquet, voire tous les paquets du cube, et rien ne les annule.
  const [packToDelete, setPackToDelete] = useState<{ id: string; label: string } | null>(null);
  const [deletingPackId, setDeletingPackId] = useState<string | null>(null);
  const [confirmDeleteCube, setConfirmDeleteCube] = useState(false);
  const [deletingCube, setDeletingCube] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cubes/${cube.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), visibility }),
      });
      if (res.ok) {
        setEditOpen(false);
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => null);
      setError(body?.error ?? t("saveError"));
    } catch {
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const createPack = async () => {
    setCreatingPack(true);
    try {
      const res = await fetch(`/api/cubes/${cube.id}/packs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: packName.trim() || undefined,
          type: packType.trim() || undefined,
        }),
      });
      if (res.ok) {
        // Les dates du corps JSON sont des chaînes : on ne type que ce qui sert.
        const pack: { id: string } = await res.json();
        router.push(`/cubes/${cube.id}/packs/${pack.id}`);
      }
    } finally {
      setCreatingPack(false);
    }
  };

  const deletePack = async (packId: string) => {
    setDeletingPackId(packId);
    try {
      const res = await fetch(`/api/cubes/${cube.id}/packs/${packId}`, { method: "DELETE" });
      if (res.ok) {
        setPackToDelete(null);
        router.refresh();
      }
    } finally {
      setDeletingPackId(null);
    }
  };

  /** Cube entier en liste de cartes : le texte est assemblé par le serveur, paquet par paquet. */
  const exportCube = async () => {
    const res = await fetch(`/api/cubes/${cube.id}/export`);
    if (!res.ok) {
      throw new Error("export failed");
    }
    const data: { text: string } = await res.json();
    return data.text;
  };

  const deleteCube = async () => {
    setDeletingCube(true);
    try {
      const res = await fetch(`/api/cubes/${cube.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/cubes");
        return;
      }
      setDeletingCube(false);
    } catch {
      setDeletingCube(false);
    }
  };

  /** Un paquet sans nom est désigné par son rang, pour rester cliquable et distinct. */
  const packLabel = (pack: CubePack, index: number) => pack.name || t("packFallbackName", { index: index + 1 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Link href="/cubes" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Boxes className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{cube.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {cube.gameName ? <Badge variant="secondary" className="text-[11px]">{cube.gameName}</Badge> : null}
              <Badge variant="outline" className="gap-1 text-[11px]">
                {VISIBILITY_ICONS[cube.visibility]}
                {t(`visibility.${cube.visibility}`)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {t("packCount", { count: cube.packsCount })} · {t("cardCount", { count: cube.cardsCount })}
              </span>
              {ownerLabel && ownerHref ? (
                <Link href={ownerHref} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                  {t("byOwner", { owner: ownerLabel })}
                </Link>
              ) : null}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button className="gap-2" asChild>
              <Link href={`/cubes/${cube.id}/play`}>
                <Dices className="size-4" />
                {t("draw.play")}
              </Link>
            </Button>
            <Button variant="outline" className="gap-2" asChild>
              <Link href={`/cubes/${cube.id}/stats`}>
                <BarChart3 className="size-4" />
                {t("stats.link")}
              </Link>
            </Button>
            <ExportCardListDialog
              title={t("export.cubeTitle")}
              triggerLabel={t("export.trigger")}
              fileName={cube.name}
              getText={exportCube}
            />
            {canEdit ? (
              <>
                <DrawSettingsDialog cubeId={cube.id} config={drawConfig} attributeOptions={attributeOptions} />
                <Dialog open={editOpen} onOpenChange={setEditOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Pencil className="size-4" />
                      {t("edit")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("editTitle")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-1">
                        <Label htmlFor="cube-edit-name">{t("form.name")}</Label>
                        <Input id="cube-edit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="cube-edit-description">{t("form.description")}</Label>
                        <Textarea
                          id="cube-edit-description"
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
                      <Button variant="ghost" onClick={() => setEditOpen(false)}>{t("cancel")}</Button>
                      <Button onClick={save} disabled={saving || !name.trim()} className="gap-2">
                        {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                        {t("save")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button
                  variant="ghost"
                  className="gap-2 text-destructive hover:text-destructive"
                  onClick={() => setConfirmDeleteCube(true)}
                  disabled={deletingCube}
                >
                  {deletingCube ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  {t("delete")}
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {cube.description ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{cube.description}</p>
        ) : null}
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("packs")}</h2>
          {canEdit ? (
            <Dialog open={packOpen} onOpenChange={setPackOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="ml-auto gap-2">
                  <Plus className="size-4" />
                  {t("addPack")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("addPackTitle")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1">
                    <Label htmlFor="pack-name">{t("form.packName")}</Label>
                    <Input id="pack-name" value={packName} onChange={(e) => setPackName(e.target.value)} maxLength={100} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pack-type">{t("form.packType")}</Label>
                    <Input id="pack-type" value={packType} onChange={(e) => setPackType(e.target.value)} maxLength={100} />
                  </div>
                  <p className="text-xs text-muted-foreground">{t("form.packHint")}</p>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setPackOpen(false)}>{t("cancel")}</Button>
                  <Button onClick={createPack} disabled={creatingPack} className="gap-2">
                    {creatingPack ? <Loader2 className="size-4 animate-spin" /> : null}
                    {t("addPack")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>

        {packs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
            <Layers className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {canEdit ? t("noPackEditable") : t("noPack")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {packs.map((pack, index) => (
              <div key={pack.id} className="group relative rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
                <Link href={`/cubes/${cube.id}/packs/${pack.id}`} className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Layers className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{packLabel(pack, index)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {pack.type ? <Badge variant="secondary" className="text-[11px]">{pack.type}</Badge> : null}
                      <span className="text-xs text-muted-foreground">{t("cardCount", { count: pack.cardsCount })}</span>
                    </div>
                  </div>
                </Link>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-2 top-2 text-destructive opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    disabled={deletingPackId === pack.id}
                    onClick={() => setPackToDelete({ id: pack.id, label: packLabel(pack, index) })}
                    aria-label={t("deletePack", { name: packLabel(pack, index) })}
                  >
                    {deletingPackId === pack.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmDeleteCube}
        onOpenChange={setConfirmDeleteCube}
        title={t("confirmDeleteCubeTitle")}
        description={t("confirmDeleteCubeDescription", { name: cube.name, count: cube.cardsCount })}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        destructive
        busy={deletingCube}
        onConfirm={deleteCube}
      />

      <ConfirmDialog
        open={packToDelete !== null}
        onOpenChange={(open) => { if (!open) setPackToDelete(null); }}
        title={t("confirmDeletePackTitle")}
        description={packToDelete ? t("confirmDeletePackDescription", { name: packToDelete.label }) : undefined}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        destructive
        busy={deletingPackId !== null}
        onConfirm={() => { if (packToDelete) void deletePack(packToDelete.id); }}
      />
    </div>
  );
}
