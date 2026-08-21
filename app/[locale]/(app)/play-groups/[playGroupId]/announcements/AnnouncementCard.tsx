"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { cn } from "@/lib/utils.ts";
import type { PlayGroupAnnouncement, PlayGroupAnnouncementScope } from "@/lib/types/PlayGroup";

import { deletePlayGroupAnnouncement, updatePlayGroupAnnouncement } from "../actions.ts";

const SCOPES: PlayGroupAnnouncementScope[] = ["group", "public"];

/**
 * Une annonce, et de quoi la reprendre.
 *
 * L'édition se fait sur place plutôt que sur un écran séparé : une annonce
 * tient en un titre et trois lignes, et corriger une heure de départ ne mérite
 * pas une navigation. La portée reste modifiable après coup — c'est le seul
 * moyen de rattraper une annonce publiée trop largement.
 */
export default function AnnouncementCard({
  playGroupId,
  announcement,
  authorName,
  publishedLabel,
  canManage,
}: {
  playGroupId: string;
  announcement: PlayGroupAnnouncement;
  authorName: string;
  publishedLabel: string | null;
  canManage: boolean;
}) {
  const t = useTranslations("PlayGroups.hub.announcements");
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(announcement.title);
  const [body, setBody] = useState(announcement.body ?? "");
  const [scope, setScope] = useState<PlayGroupAnnouncementScope>(announcement.scope);

  const className = cn(
    "flex flex-col gap-2 rounded-xl border p-5",
    announcement.scope === "group"
      ? "border-[var(--group-accent-28)] bg-[image:var(--group-accent-sweep)]"
      : "bg-card",
  );

  if (editing) {
    return (
      <section className={className}>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} aria-label={t("titleLabel")} />
        <Textarea value={body} onChange={(event) => setBody(event.target.value)} aria-label={t("bodyLabel")} rows={3} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-[9px] border p-1">
            {SCOPES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setScope(value)}
                className={cn(
                  "rounded-[6px] px-3 py-1.5 text-[13px] transition-colors",
                  scope === value
                    ? "bg-[var(--group-accent-16)] font-semibold text-[var(--group-accent-text)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(value === "group" ? "scopeGroupChoice" : "scopePublicChoice")}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={pending} onClick={() => setEditing(false)}>
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              disabled={pending || title.trim().length === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await updatePlayGroupAnnouncement(playGroupId, announcement.id, { title, body, scope });
                  if (result.success) {
                    setEditing(false);
                    return;
                  }

                  toast.error(t(result.error === "INVALID" ? "invalid" : "error"));
                })
              }
            >
              {t("save")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <article className={className}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-sm font-semibold">{authorName}</span>
        {publishedLabel && <time className="font-mono text-[11px] text-muted-foreground">{publishedLabel}</time>}
        <span
          className={
            announcement.scope === "public"
              ? "rounded-[5px] bg-cyan-400/15 px-1.5 py-0.5 font-mono text-[10px] tracking-[.08em] text-cyan-300 uppercase"
              : "rounded-[5px] border px-1.5 py-0.5 font-mono text-[10px] tracking-[.08em] text-muted-foreground uppercase"
          }
        >
          {t(announcement.scope === "public" ? "scopePublic" : "scopeGroup")}
        </span>

        {canManage && (
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label={t("edit")} onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("delete")}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deletePlayGroupAnnouncement(playGroupId, announcement.id);
                  if (!result.success) {
                    toast.error(t("error"));
                  }
                })
              }
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        )}
      </div>

      <h2 className="text-base font-semibold">{announcement.title}</h2>
      {announcement.body && (
        <p className="text-[13px] leading-[1.55] text-pretty text-muted-foreground">{announcement.body}</p>
      )}
    </article>
  );
}
