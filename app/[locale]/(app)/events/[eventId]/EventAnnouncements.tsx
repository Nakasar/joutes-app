"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { Megaphone, Plus, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation.ts";
import type { Announcement } from "@/lib/schemas/event-portal.schema.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { createAnnouncement, deleteAnnouncement } from "./portal/actions.ts";

type Priority = Announcement["priority"];
const PRIORITIES: Priority[] = ["normal", "important", "urgent"];

/**
 * Annonces de l'événement, sur sa page : la communication avec les inscrits
 * appartient à l'événement, pas au tournoi. Les inscrits les lisent ;
 * l'organisation les publie (avec notification) et les retire.
 */
export default function EventAnnouncements({
  eventId,
  announcements,
  canPost,
}: {
  eventId: string;
  announcements: Announcement[];
  canPost: boolean;
}) {
  const t = useTranslations("EventDetail.announcements");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [error, setError] = useState<string | null>(null);

  const publish = () => {
    setError(null);
    startTransition(async () => {
      const result = await createAnnouncement(eventId, { message: message.trim(), priority });
      if (!result.success) {
        setError(result.error ?? t("error"));
        return;
      }
      setMessage("");
      setPriority("normal");
      setFormOpen(false);
      router.refresh();
    });
  };

  const remove = (announcementId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteAnnouncement(eventId, announcementId);
      if (!result.success) {
        setError(result.error ?? t("error"));
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Megaphone className="h-5 w-5" />
          {t("title")}
        </h2>
        {canPost && !formOpen && (
          <Button variant="ghost" size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("new")}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {formOpen && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-1.5">
            <Label htmlFor="event-announcement-message">{t("message")}</Label>
            <Textarea
              id="event-announcement-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("placeholder")}
              maxLength={1000}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{t("notifyHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-announcement-priority">{t("priority")}</Label>
            <Select value={priority} onValueChange={(value) => setPriority(value as Priority)}>
              <SelectTrigger id="event-announcement-priority" className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`priorities.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={publish} disabled={isPending || !message.trim()}>
              {t("publish")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setFormOpen(false)} disabled={isPending}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      {announcements.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {announcements.map((announcement) => (
            <li key={announcement.id} className="flex items-start gap-2 rounded-lg bg-muted/50 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {announcement.priority !== "normal" && (
                    <Badge variant={announcement.priority === "urgent" ? "destructive" : "secondary"}>
                      {t(`priorities.${announcement.priority}`)}
                    </Badge>
                  )}
                  <span suppressHydrationWarning>
                    {DateTime.fromISO(announcement.createdAt)
                      .setZone("Europe/Paris")
                      .setLocale(locale)
                      .toLocaleString(DateTime.DATETIME_MED)}
                  </span>
                </div>
                <p className="whitespace-pre-line break-words text-sm">{announcement.message}</p>
              </div>
              {canPost && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => remove(announcement.id)}
                  disabled={isPending}
                  aria-label={t("delete")}
                  title={t("delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
