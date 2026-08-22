"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { Eye, EyeOff, FileText, Play, Plus, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import type { UserContent } from "@/lib/types/UserContent";
import { cn } from "@/lib/utils.ts";

import ContentForm from "./ContentForm.tsx";
import {
  deleteUserContentAction,
  setUserContentVisibilityAction,
  type ContentError,
} from "./content-actions.ts";

const ICONS = { video: Play, article: FileText, replay: Radio } as const;

/**
 * L'écran des publications d'un joueur.
 *
 * La liste et le formulaire vivent ensemble : on publie rarement plus de
 * quelques contenus, et une route de plus pour l'édition d'un titre coûterait
 * plus qu'elle ne rapporte — la configuration de routage de Vercel plafonnant
 * de surcroît à 2048 entrées.
 *
 * **La visibilité est une bascule de la liste, pas un champ du formulaire.**
 * Repasser un article en brouillon est le geste qu'on fait vite, sans vouloir
 * rouvrir ce qu'on a écrit.
 */
export default function ContentsClient({
  contents: initial,
  locale,
}: {
  contents: UserContent[];
  locale: string;
}) {
  const t = useTranslations("Account.contents");
  const router = useRouter();
  const [editing, setEditing] = useState<UserContent | "new" | null>(null);
  const [isBusy, startTransition] = useTransition();

  const errorMessage = (error: ContentError) => t(`errors.${error}` as "errors.FAILED");

  const toggleVisibility = (content: UserContent) => {
    const next = content.visibility === "public" ? "private" : "public";

    startTransition(async () => {
      const result = await setUserContentVisibilityAction(content.id, next);

      if (!result.success) {
        toast.error(errorMessage(result.error));
        return;
      }

      router.refresh();
    });
  };

  const remove = (content: UserContent) => {
    startTransition(async () => {
      const result = await deleteUserContentAction(content.id);

      if (!result.success) {
        toast.error(errorMessage(result.error));
        return;
      }

      toast.success(t("deleted"));
      router.refresh();
    });
  };

  if (editing) {
    return (
      <ContentForm
        content={editing === "new" ? null : editing}
        onDone={() => {
          setEditing(null);
          router.refresh();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="max-w-[640px] text-pretty text-muted-foreground">{t("description")}</p>
        </div>

        <Button onClick={() => setEditing("new")}>
          <Plus className="mr-2 size-4" aria-hidden />
          {t("new")}
        </Button>
      </div>

      {initial.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {initial.map((content) => {
            const Icon = ICONS[content.kind];
            const isPublic = content.visibility === "public";
            const date = DateTime.fromISO(content.publishedAt).setLocale(locale);

            return (
              <li
                key={content.id}
                className={cn(
                  "flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4",
                  !isPublic && "border-dashed",
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[15px] font-semibold">{content.title}</span>
                  <span className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground uppercase">
                    <span>{t(`kinds.${content.kind}` as "kinds.video")}</span>
                    <span aria-hidden>·</span>
                    <span>{date.isValid ? date.toFormat("d LLL yyyy") : ""}</span>
                  </span>
                </span>

                <Badge variant={isPublic ? "default" : "outline"} className="shrink-0">
                  {isPublic ? t("visibility.public") : t("visibility.private")}
                </Badge>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => toggleVisibility(content)}
                  >
                    {isPublic ? (
                      <EyeOff className="mr-2 size-3.5" aria-hidden />
                    ) : (
                      <Eye className="mr-2 size-3.5" aria-hidden />
                    )}
                    {isPublic ? t("visibility.makePrivate") : t("visibility.makePublic")}
                  </Button>

                  <Button variant="outline" size="sm" onClick={() => setEditing(content)}>
                    {t("edit")}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("delete")}
                    disabled={isBusy}
                    onClick={() => remove(content)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
