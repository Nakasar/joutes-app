"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Loader2, Pencil, Pin, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import { cn } from "@/lib/utils.ts";
import type { LairNewsItem } from "@/lib/types/Lair";

import ImageDropzone from "./ImageDropzone.tsx";
import { updateLairNews, type LairCustomizationError } from "./customization-actions.ts";

const ERROR_KEYS: Record<LairCustomizationError, string> = {
  INVALID: "errors.invalid",
  NOT_FOUND: "errors.notFound",
  PRO_REQUIRED: "errors.proRequired",
  FAILED: "errors.failed",
};

/** Une annonce vierge, datée de maintenant. */
function blankItem(): LairNewsItem {
  return {
    // `crypto.randomUUID` plutôt qu'un compteur : deux onglets ouverts sur le
    // même lieu ne doivent pas fabriquer deux annonces de même identifiant.
    id: crypto.randomUUID(),
    title: "",
    publishedAt: DateTime.now().toISO() ?? new Date().toISOString(),
  };
}

/**
 * Les annonces du lieu.
 *
 * L'écriture porte sur la liste entière et non sur une annonce à la fois :
 * l'épinglage est une propriété de la liste — une seule annonce peut la porter
 * —, et l'enregistrer article par article ouvrirait une fenêtre où deux le
 * sont. Épingler ici dépingle donc l'autre, dans le même envoi.
 */
export default function LairNewsEditor({
  lairId,
  news,
}: {
  lairId: string;
  news: LairNewsItem[];
}) {
  const t = useTranslations("Lairs.manage.customization.news");
  const [items, setItems] = useState<LairNewsItem[]>(news);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const persist = (next: LairNewsItem[], message: string, onSuccess?: () => void) => {
    setIssues({});

    startTransition(async () => {
      const result = await updateLairNews(lairId, next);

      if (result.success) {
        setItems(next);
        toast.success(message);
        onSuccess?.();
        return;
      }

      // L'éditeur reste ouvert : c'est le seul endroit où les messages de
      // champ sont rendus, et le refermer sur un refus laissait le gérant
      // devant un toast rouge sans savoir quoi corriger.
      setIssues(result.issues ?? {});
      toast.error(t(ERROR_KEYS[result.error]));
    });
  };

  const update = (id: string, patch: Partial<LairNewsItem>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const sorted = [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">{t("description")}</p>
        <Button
          type="button"
          size="sm"
          disabled={isPending || editing !== null || items.length >= 30}
          onClick={() => {
            const item = blankItem();
            setItems((current) => [item, ...current]);
            setEditing(item.id);
          }}
        >
          <Plus className="mr-2 size-4" aria-hidden />
          {t("add")}
        </Button>
      </div>

      {sorted.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {sorted.map((item) => (
          <li key={item.id} className="rounded-xl border bg-card">
            {editing === item.id ? (
              <div className="flex flex-col gap-4 p-5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`title-${item.id}`}>{t("fields.title")}</Label>
                  <Input
                    id={`title-${item.id}`}
                    value={item.title}
                    onChange={(event) => update(item.id, { title: event.target.value })}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`category-${item.id}`}>{t("fields.category")}</Label>
                    <Input
                      id={`category-${item.id}`}
                      value={item.category ?? ""}
                      placeholder={t("fields.categoryPlaceholder")}
                      onChange={(event) => update(item.id, { category: event.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`date-${item.id}`}>{t("fields.publishedAt")}</Label>
                    <Input
                      id={`date-${item.id}`}
                      type="date"
                      value={DateTime.fromISO(item.publishedAt).toFormat("yyyy-MM-dd")}
                      onChange={(event) => {
                        const date = DateTime.fromISO(event.target.value);
                        if (date.isValid) {
                          update(item.id, { publishedAt: date.toISO() ?? item.publishedAt });
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`summary-${item.id}`}>{t("fields.summary")}</Label>
                  <Textarea
                    id={`summary-${item.id}`}
                    rows={2}
                    value={item.summary ?? ""}
                    onChange={(event) => update(item.id, { summary: event.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`content-${item.id}`}>{t("fields.content")}</Label>
                  <Textarea
                    id={`content-${item.id}`}
                    rows={6}
                    value={item.content ?? ""}
                    onChange={(event) => update(item.id, { content: event.target.value })}
                  />
                  <p className="font-mono text-[11px] text-muted-foreground">{t("fields.markdown")}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`link-${item.id}`}>{t("fields.link")}</Label>
                    <Input
                      id={`link-${item.id}`}
                      type="url"
                      value={item.link ?? ""}
                      placeholder="https://"
                      className="font-mono text-xs"
                      onChange={(event) => update(item.id, { link: event.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`linkLabel-${item.id}`}>{t("fields.linkLabel")}</Label>
                    <Input
                      id={`linkLabel-${item.id}`}
                      value={item.linkLabel ?? ""}
                      onChange={(event) => update(item.id, { linkLabel: event.target.value })}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>{t("fields.banner")}</Label>
                  <ImageDropzone
                    lairId={lairId}
                    value={item.banner}
                    label={t("fields.bannerLabel")}
                    previewClassName="h-32"
                    className="max-w-sm"
                    onChange={(url) => update(item.id, { banner: url })}
                  />
                </div>

                {Object.values(issues).length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {Object.entries(issues).map(([path, message]) => (
                      <li key={path} className="text-xs text-destructive">
                        {message}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={() => persist(items, t("saved"), () => setEditing(null))}
                  >
                    {isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
                    {t("save")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // Annuler ne défait que la ligne éditée. Remplacer toute
                      // la liste par la version serveur emporterait au passage
                      // les autres modifications en cours.
                      const saved = news.find((entry) => entry.id === item.id);
                      setItems((current) =>
                        saved
                          ? current.map((entry) => (entry.id === item.id ? saved : entry))
                          : current.filter((entry) => entry.id !== item.id),
                      );
                      setEditing(null);
                      setIssues({});
                    }}
                  >
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 p-4">
                {item.pinned && <Pin className="size-4 shrink-0 text-primary" aria-hidden />}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {item.title || t("untitled")}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {DateTime.fromISO(item.publishedAt).toFormat("dd/MM/yyyy")}
                    {item.category ? ` · ${item.category}` : ""}
                  </span>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isPending || editing !== null}
                  className={cn(item.pinned && "text-primary")}
                  onClick={() =>
                    persist(
                      items.map((entry) => ({
                        ...entry,
                        // Épingler celle-ci dépingle les autres, dans le même
                        // envoi : le schéma refuse deux annonces épinglées.
                        pinned: entry.id === item.id ? !item.pinned : false,
                      })),
                      item.pinned ? t("unpinned") : t("pinned"),
                    )
                  }
                >
                  <Pin className="mr-2 size-3.5" aria-hidden />
                  {item.pinned ? t("unpin") : t("pin")}
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={editing !== null}
                  onClick={() => setEditing(item.id)}
                >
                  <Pencil className="mr-2 size-3.5" aria-hidden />
                  {t("edit")}
                </Button>

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("delete")}
                  disabled={isPending || editing !== null}
                  onClick={() => setDeleting(item.id)}
                >
                  <Trash2 className="size-4 text-destructive" aria-hidden />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("deleteConfirmTitle")}
        description={t("deleteConfirmDescription")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        destructive
        busy={isPending}
        onConfirm={() => {
          persist(items.filter((item) => item.id !== deleting), t("deleted"));
          setDeleting(null);
        }}
      />
    </div>
  );
}
