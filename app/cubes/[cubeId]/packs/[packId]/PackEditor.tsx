"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Layers, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import CardsPicker from "@/components/CardsPicker";
import type { BoosterCard } from "@/lib/types/booster";
import type { Cube, CubeCard, CubePack } from "@/lib/types/Cube";

type Props = {
  cube: Cube;
  pack: CubePack;
  packLabel: string;
  initialCards: CubeCard[];
  canEdit: boolean;
};

export default function PackEditor({ cube, pack, packLabel, initialCards, canEdit }: Props) {
  const t = useTranslations("Cubes");
  const router = useRouter();

  const [cards, setCards] = useState<CubeCard[]>(initialCards);
  // Les ajouts et retraits sont appliqués localement pour rester immédiats ; ce
  // rattrapage réaligne la liste sur le serveur après un `router.refresh()`.
  useEffect(() => setCards(initialCards), [initialCards]);

  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [name, setName] = useState(pack.name ?? "");
  const [type, setType] = useState(pack.type ?? "");
  const [savingDetails, setSavingDetails] = useState(false);

  /**
   * Le sélecteur retient les cartes choisies ; ici chaque choix part
   * immédiatement au serveur et la sélection est vidée, pour qu'un même
   * exemplaire puisse être ajouté plusieurs fois à un paquet.
   */
  const addCards = async (picked: BoosterCard[]) => {
    const card = picked[picked.length - 1];
    if (!card) return;

    setAdding(true);
    try {
      const res = await fetch(`/api/cubes/${cube.id}/packs/${pack.id}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.id,
          name: card.name,
          setCode: card.setCode,
          collectorNumber: String(card.collectorNumber),
          image: card.image,
        }),
      });
      if (res.ok) {
        const created: CubeCard = await res.json();
        setCards((prev) => [...prev, created]);
        router.refresh();
      }
    } finally {
      setAdding(false);
    }
  };

  const removeCard = async (entryId: string) => {
    setRemovingId(entryId);
    const snapshot = cards;
    setCards((prev) => prev.filter((card) => card.id !== entryId));
    try {
      const res = await fetch(
        `/api/cubes/${cube.id}/packs/${pack.id}/cards?entryId=${encodeURIComponent(entryId)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        router.refresh();
      } else {
        setCards(snapshot);
      }
    } catch {
      setCards(snapshot);
    } finally {
      setRemovingId(null);
    }
  };

  const saveDetails = async () => {
    setSavingDetails(true);
    try {
      const res = await fetch(`/api/cubes/${cube.id}/packs/${pack.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type: type.trim() }),
      });
      if (res.ok) {
        setDetailsOpen(false);
        router.refresh();
      }
    } finally {
      setSavingDetails(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/cubes/${cube.id}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("backToCube", { name: cube.name })}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{packLabel}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {pack.type ? <Badge variant="secondary" className="text-[11px]">{pack.type}</Badge> : null}
              <span className="text-xs text-muted-foreground">{t("cardCount", { count: cards.length })}</span>
            </div>
          </div>
          {canEdit ? (
            <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="ml-auto gap-2">
                  <Pencil className="size-4" />
                  {t("editPack")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("editPackTitle")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1">
                    <Label htmlFor="pack-edit-name">{t("form.packName")}</Label>
                    <Input id="pack-edit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pack-edit-type">{t("form.packType")}</Label>
                    <Input id="pack-edit-type" value={type} onChange={(e) => setType(e.target.value)} maxLength={100} />
                  </div>
                  <p className="text-xs text-muted-foreground">{t("form.packHint")}</p>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setDetailsOpen(false)}>{t("cancel")}</Button>
                  <Button onClick={saveDetails} disabled={savingDetails} className="gap-2">
                    {savingDetails ? <Loader2 className="size-4 animate-spin" /> : null}
                    {t("save")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      {canEdit ? (
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("addCards")}</h2>
          <CardsPicker
            gameSlugOrId={cube.gameSlug ?? cube.gameId}
            selectedCards={[]}
            onChange={addCards}
            searchPlaceholder={t("searchCardPlaceholder")}
            emptyMessage={t("noCardFound")}
            searchingLabel={t("searching")}
          />
          <p className="text-xs text-muted-foreground">
            {adding ? t("addingCard") : t("addCardsHint")}
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("packContents")}</h2>
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
            <Layers className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{canEdit ? t("emptyPackEditable") : t("emptyPack")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {cards.map((card) => (
              <div key={card.id} className="group relative overflow-hidden rounded-lg border bg-card">
                <div className="relative aspect-[3/4] w-full bg-muted">
                  {card.image ? (
                    <Image src={card.image} alt={card.name} fill unoptimized sizes="120px" className="object-cover" />
                  ) : null}
                  {canEdit ? (
                    <Button
                      variant="destructive"
                      size="icon-sm"
                      className="absolute right-1 top-1 size-6 opacity-0 transition-opacity group-hover:opacity-100"
                      disabled={removingId === card.id}
                      onClick={() => removeCard(card.id)}
                      aria-label={t("removeCard", { name: card.name })}
                    >
                      {removingId === card.id ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                    </Button>
                  ) : null}
                </div>
                <div className="p-1.5">
                  <p className="truncate text-[11px] font-medium leading-tight" title={card.name}>{card.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {card.setCode} #{card.collectorNumber}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
