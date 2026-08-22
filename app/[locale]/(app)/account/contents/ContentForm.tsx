"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import ImageDropzone from "@/components/ImageDropzone.tsx";
import { USER_CONTENT_KINDS, type UserContent, type UserContentKind } from "@/lib/types/UserContent";
import { cn } from "@/lib/utils.ts";

import { saveUserContentAction, type ContentError } from "./content-actions.ts";

/**
 * Le formulaire d'une publication.
 *
 * Les champs suivent le genre : un article demande son texte, une vidéo et un
 * replay leur adresse. Le contrôle est refait côté serveur — un champ caché
 * dans le navigateur ne protège rien — mais le montrer ici évite de faire
 * écrire un titre pour se voir refuser au moment d'enregistrer.
 *
 * Une publication naît **en brouillon** : on écrit avant de montrer, et rien
 * de ce qu'on tape n'apparaît nulle part avant qu'on le décide.
 */
export default function ContentForm({
  content,
  onDone,
  onCancel,
}: {
  content: UserContent | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Account.contents");
  const [kind, setKind] = useState<UserContentKind>(content?.kind ?? "video");
  const [title, setTitle] = useState(content?.title ?? "");
  const [summary, setSummary] = useState(content?.summary ?? "");
  const [body, setBody] = useState(content?.body ?? "");
  const [url, setUrl] = useState(content?.url ?? "");
  const [thumbnail, setThumbnail] = useState(content?.thumbnail);
  const [duration, setDuration] = useState(content?.duration ?? "");
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [isSaving, startSaving] = useTransition();

  const isArticle = kind === "article";
  const errorMessage = (error: ContentError) => t(`errors.${error}` as "errors.FAILED");

  const save = () => {
    startSaving(async () => {
      const result = await saveUserContentAction(content?.id ?? null, {
        kind,
        // Une publication naît en brouillon ; une existante garde ce qu'elle
        // avait — la bascule de la liste est le seul endroit qui la change.
        visibility: content?.visibility ?? "private",
        title,
        summary,
        body,
        url,
        thumbnail: thumbnail ?? "",
        duration,
      });

      if (!result.success) {
        setIssues(result.issues ?? {});
        toast.error(errorMessage(result.error));
        return;
      }

      toast.success(t("saved"));
      onDone();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Button variant="outline" size="sm" onClick={onCancel} className="self-start">
        <ArrowLeft className="mr-2 size-4" aria-hidden />
        {t("back")}
      </Button>

      <div className="flex flex-col gap-4 rounded-xl border p-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t("form.kind")}</legend>
          <div className="flex flex-wrap gap-2">
            {USER_CONTENT_KINDS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                aria-pressed={kind === value}
                className={cn(
                  "min-h-11 rounded-md border px-4 text-sm transition-colors sm:min-h-0 sm:py-2",
                  kind === value
                    ? "border-primary bg-primary/10 font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`kinds.${value}` as "kinds.video")}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-title">{t("form.title")}</Label>
          <Input
            id="content-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={140}
          />
          {issues.title && <p className="text-xs text-destructive">{issues.title}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-summary">{t("form.summary")}</Label>
          <Textarea
            id="content-summary"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={2}
            maxLength={300}
          />
          {issues.summary && <p className="text-xs text-destructive">{issues.summary}</p>}
        </div>

        {isArticle ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="content-body">{t("form.body")}</Label>
            <Textarea
              id="content-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">{t("form.bodyHint")}</p>
            {issues.body && <p className="text-xs text-destructive">{issues.body}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="content-url">{t("form.url")}</Label>
            <Input
              id="content-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://"
              inputMode="url"
            />
            {issues.url && <p className="text-xs text-destructive">{issues.url}</p>}
          </div>
        )}

        <div className="flex flex-wrap items-start gap-5">
          <ImageDropzone
            value={thumbnail}
            onChange={setThumbnail}
            uploadUrl="/api/users/me/upload"
            extraFields={{ kind: "banner" }}
            label={t("form.thumbnail")}
            labels={{ failed: t("errors.FAILED"), remove: t("delete") }}
            className="min-w-[200px] flex-1"
            previewClassName="h-28"
          />

          {!isArticle && (
            <div className="flex w-[160px] flex-col gap-1.5">
              <Label htmlFor="content-duration">{t("form.duration")}</Label>
              <Input
                id="content-duration"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                placeholder={t("form.durationPlaceholder")}
                maxLength={20}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={save} disabled={isSaving}>
            {t("form.save")}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            {t("form.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
