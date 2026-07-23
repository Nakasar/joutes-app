"use client";

import { useState } from "react";
import { Megaphone, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { TournamentAnnouncement } from "@/lib/types/Tournament";

export function AnnouncementsManager({
  tournamentId,
  initialAnnouncements,
}: {
  tournamentId: string;
  initialAnnouncements: TournamentAnnouncement[];
}) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [message, setMessage] = useState("");
  const [level, setLevel] = useState<"info" | "urgent">("info");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), level }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Erreur lors de la création de l'annonce");
      }
      const created: TournamentAnnouncement = await res.json();
      setAnnouncements((current) => [created, ...current]);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création de l'annonce");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/announcements/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Erreur lors de la suppression");
      }
      setAnnouncements((current) => current.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Annonces</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="announcement-message">Nouvelle annonce</Label>
          <Textarea
            id="announcement-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Message diffusé aux joueurs..."
            maxLength={500}
            rows={2}
          />
          <div className="flex items-center gap-2">
            <Select value={level} onValueChange={(v) => setLevel(v as "info" | "urgent")}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={create} disabled={busy || !message.trim()}>
              <Megaphone className="mr-2 h-4 w-4" />
              Publier
            </Button>
          </div>
        </div>

        {announcements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune annonce publiée.</p>
        ) : (
          <ul className="space-y-2">
            {announcements.map((announcement) => (
              <li
                key={announcement.id}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-lg border p-3",
                  announcement.level === "urgent" && "border-destructive/40 bg-destructive/10"
                )}
              >
                <div className="space-y-1">
                  <Badge variant={announcement.level === "urgent" ? "destructive" : "secondary"}>
                    {announcement.level === "urgent" ? "Urgent" : "Info"}
                  </Badge>
                  <p className="whitespace-pre-wrap text-sm">{announcement.message}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-800"
                  onClick={() => remove(announcement.id)}
                  disabled={busy}
                  aria-label="Supprimer l'annonce"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
