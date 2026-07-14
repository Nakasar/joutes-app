"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Heart, Loader2, Lock, Plus, Globe, Link as LinkIcon, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Wishlist, WishlistVisibility } from "@/lib/types/Wishlist";

type WishlistsClientProps = {
  initialWishlists: Wishlist[];
  apiBasePath: string;
};

const VISIBILITY_ICONS: Record<WishlistVisibility, React.ReactNode> = {
  private: <Lock className="size-3.5" />,
  unlisted: <LinkIcon className="size-3.5" />,
  public: <Globe className="size-3.5" />,
};

function WishlistFormFields({
  name,
  setName,
  description,
  setDescription,
  visibility,
  setVisibility,
  t,
}: {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  visibility: WishlistVisibility;
  setVisibility: (v: WishlistVisibility) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-1">
        <Label htmlFor="wishlist-name">{t("form.name")}</Label>
        <Input id="wishlist-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="wishlist-description">{t("form.description")}</Label>
        <Textarea
          id="wishlist-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={3}
        />
      </div>
      <div className="space-y-1">
        <Label>{t("form.visibility")}</Label>
        <Select value={visibility} onValueChange={(v) => setVisibility(v as WishlistVisibility)}>
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
    </div>
  );
}

export default function WishlistsClient({ initialWishlists, apiBasePath }: WishlistsClientProps) {
  const t = useTranslations("Wishlists");
  const [wishlists, setWishlists] = useState(initialWishlists);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createVisibility, setCreateVisibility] = useState<WishlistVisibility>("private");
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<Wishlist | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVisibility, setEditVisibility] = useState<WishlistVisibility>("private");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(apiBasePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim() || undefined,
          visibility: createVisibility,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("errors.create"));
        return;
      }
      const wishlist: Wishlist = await res.json();
      setWishlists((prev) => [wishlist, ...prev]);
      setCreateOpen(false);
      setCreateName("");
      setCreateDescription("");
      setCreateVisibility("private");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(wishlist: Wishlist) {
    setEditing(wishlist);
    setEditName(wishlist.name);
    setEditDescription(wishlist.description ?? "");
    setEditVisibility(wishlist.visibility);
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBasePath}/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          visibility: editVisibility,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("errors.update"));
        return;
      }
      const updated: Wishlist = await res.json();
      setWishlists((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(wishlistId: string) {
    const res = await fetch(`${apiBasePath}/${wishlistId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(t("errors.delete"));
      return;
    }
    setWishlists((prev) => prev.filter((w) => w.id !== wishlistId));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Heart className="size-7 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="size-4" />
              {t("create.trigger")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("create.title")}</DialogTitle>
            </DialogHeader>
            <WishlistFormFields
              name={createName}
              setName={setCreateName}
              description={createDescription}
              setDescription={setCreateDescription}
              visibility={createVisibility}
              setVisibility={setCreateVisibility}
              t={t}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
                {t("form.cancel")}
              </Button>
              <Button onClick={handleCreate} disabled={creating || !createName.trim()}>
                {creating && <Loader2 className="mr-2 size-4 animate-spin" />}
                {t("create.submit")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {wishlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Heart className="size-10 text-muted-foreground" />
          <p className="font-semibold">{t("empty.title")}</p>
          <p className="text-sm text-muted-foreground">{t("empty.description")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {wishlists.map((wishlist) => (
            <div key={wishlist.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/wishlists/${wishlist.id}`} className="font-semibold leading-tight hover:text-primary">
                  {wishlist.name}
                </Link>
                <Badge variant="outline" className="shrink-0 gap-1">
                  {VISIBILITY_ICONS[wishlist.visibility]}
                  {t(`visibility.${wishlist.visibility}`)}
                </Badge>
              </div>
              {wishlist.description && (
                <p className="line-clamp-2 text-sm text-muted-foreground">{wishlist.description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("card.itemsCount", { count: wishlist.itemsCount })} ·{" "}
                {t("card.updatedAt", {
                  date: DateTime.fromJSDate(new Date(wishlist.updatedAt)).toRelative() ?? "",
                })}
              </p>
              <div className="mt-auto flex items-center gap-2 pt-1">
                <Button asChild size="sm" className="flex-1">
                  <Link href={`/wishlists/${wishlist.id}`}>{t("card.open")}</Link>
                </Button>
                <Button variant="outline" size="icon-sm" onClick={() => openEdit(wishlist)} aria-label={t("card.edit")}>
                  <Pencil className="size-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      aria-label={t("card.delete")}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("delete.description", { name: wishlist.name })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("form.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(wishlist.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t("delete.confirm")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("edit.title")}</DialogTitle>
          </DialogHeader>
          <WishlistFormFields
            name={editName}
            setName={setEditName}
            description={editDescription}
            setDescription={setEditDescription}
            visibility={editVisibility}
            setVisibility={setEditVisibility}
            t={t}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              {t("form.cancel")}
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editName.trim()}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t("edit.submit")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
