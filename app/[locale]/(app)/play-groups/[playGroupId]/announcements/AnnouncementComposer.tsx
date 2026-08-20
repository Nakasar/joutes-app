"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { cn } from "@/lib/utils.ts";
import type { PlayGroupAnnouncementScope } from "@/lib/types/PlayGroup";

import { publishPlayGroupAnnouncement } from "../actions.ts";

const SCOPES: PlayGroupAnnouncementScope[] = ["group", "public"];

/**
 * Le composeur d'annonce, réservé au fondateur et aux admins.
 *
 * La portée est un segmenté et non une case à cocher : « réservée au groupe »
 * et « publique » sont deux gestes différents, et l'un des deux sort le texte
 * du groupe. Le choix doit se voir avant de publier, pas se déduire d'une case
 * décochée.
 */
export default function AnnouncementComposer({
  playGroupId,
  canPublish,
}: {
  playGroupId: string;
  canPublish: boolean;
}) {
  const t = useTranslations("PlayGroups.hub.announcements");
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<PlayGroupAnnouncementScope>("group");

  if (!canPublish) {
    return (
      <p className="flex items-center gap-2.5 rounded-xl border border-dashed bg-card/60 px-4 py-3.5 text-[13px] text-muted-foreground">
        <Lock className="size-4 shrink-0" aria-hidden />
        {t("membersCannotPublish")}
      </p>
    );
  }

  const onPublish = () => {
    startTransition(async () => {
      const result = await publishPlayGroupAnnouncement(playGroupId, { title, body, scope });
      if (!result.success) {
        toast.error(t(result.error === "INVALID" ? "invalid" : "error"));
        return;
      }

      setTitle("");
      setBody("");
    });
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t("titlePlaceholder")}
        aria-label={t("titleLabel")}
      />
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={t("bodyPlaceholder")}
        aria-label={t("bodyLabel")}
        rows={3}
      />

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

        <Button size="sm" disabled={pending || title.trim().length === 0} onClick={onPublish}>
          {t("publish")}
        </Button>
      </div>
    </section>
  );
}
