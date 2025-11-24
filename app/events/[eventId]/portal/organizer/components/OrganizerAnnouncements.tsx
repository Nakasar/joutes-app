"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Event } from "@/lib/types/Event";
import { Announcement } from "@/lib/schemas/event-portal.schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import {
  createAnnouncement,
  deleteAnnouncement,
} from "../../actions";

type OrganizerAnnouncementsProps = {
  event: Event;
  announcements: Announcement[];
};

export default function OrganizerAnnouncements({
  event,
  announcements,
}: OrganizerAnnouncementsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({
    message: "",
    priority: "normal" as "normal" | "important" | "urgent",
  });

  const handleCreateAnnouncement = () => {
    startTransition(async () => {
      await createAnnouncement(event.id, {
        message: announcementForm.message,
        priority: announcementForm.priority,
      });

      setAnnouncementForm({
        message: "",
        priority: "normal",
      });
      setShowAnnouncementForm(false);
      router.refresh();
    });
  };

  const handleDeleteAnnouncement = (announcementId: string) => {
    startTransition(async () => {
      await deleteAnnouncement(event.id, announcementId);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Annonces</CardTitle>
              <CardDescription>
                Communiquez avec les participants
              </CardDescription>
            </div>
            <Button onClick={() => setShowAnnouncementForm(!showAnnouncementForm)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle annonce
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showAnnouncementForm && (
            <div className="border rounded-lg p-4 space-y-4">
              <div>
                <label className="text-sm font-medium">Message</label>
                <textarea
                  className="w-full border rounded-md p-2 min-h-[100px]"
                  value={announcementForm.message}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, message: e.target.value })}
                  placeholder="Votre annonce..."
                  maxLength={1000}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Priorité</label>
                <select
                  className="w-full border rounded-md p-2"
                  value={announcementForm.priority}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, priority: e.target.value as any })}
                >
                  <option value="normal">Normale</option>
                  <option value="important">Importante</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={handleCreateAnnouncement} 
                  disabled={isPending || !announcementForm.message}
                >
                  Publier
                </Button>
                <Button variant="outline" onClick={() => setShowAnnouncementForm(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {announcements.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune annonce publiée</p>
          ) : (
            <div className="space-y-2">
              {announcements.map((announcement) => (
                <div key={announcement.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={
                          announcement.priority === "urgent" ? "destructive" : 
                          announcement.priority === "important" ? "secondary" : "outline"
                        }>
                          {announcement.priority === "urgent" ? "Urgent" : 
                           announcement.priority === "important" ? "Important" : "Normal"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(announcement.createdAt).toLocaleString("fr-FR")}
                        </span>
                      </div>
                      <p className="text-sm">{announcement.message}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteAnnouncement(announcement.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
