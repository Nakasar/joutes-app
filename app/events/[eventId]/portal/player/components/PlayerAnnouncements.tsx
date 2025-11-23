"use client";

import { Event } from "@/lib/types/Event";
import { Announcement } from "@/lib/schemas/event-portal.schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type PlayerAnnouncementsProps = {
  event: Event;
  announcements: Announcement[];
};

export default function PlayerAnnouncements({ event, announcements }: PlayerAnnouncementsProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Annonces</CardTitle>
          <CardDescription>
            Messages de l&apos;organisateur
          </CardDescription>
        </CardHeader>
        <CardContent>
          {announcements.length === 0 ? (
            <p className="text-center text-muted-foreground">
              Aucune annonce pour le moment
            </p>
          ) : (
            <div className="space-y-2">
              {announcements
                .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                .map((announcement) => (
                  <div 
                    key={announcement.id} 
                    className={`border rounded-lg p-4 ${
                      announcement.priority === "urgent" 
                        ? "border-red-500 bg-red-50 dark:bg-red-900/10" 
                        : announcement.priority === "important" 
                          ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/10"
                          : ""
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <Badge variant={
                        announcement.priority === "urgent" ? "destructive" :
                        announcement.priority === "important" ? "default" :
                        "secondary"
                      }>
                        {announcement.priority === "urgent" && "Urgent"}
                        {announcement.priority === "important" && "Important"}
                        {announcement.priority === "normal" && "Info"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(announcement.createdAt || "").toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm">{announcement.message}</p>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
