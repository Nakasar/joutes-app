"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { importLocatorMatchesAction } from "./actions.ts";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Sous le filtre d'une source : importe (ou réimporte) les matchs du tournoi
 * du locator dont viennent ses decks, pour un tournoi importé sans eux.
 */
export function CompleteMatchesBar({
  gameId,
  source,
  events,
}: {
  gameId: string;
  source: string;
  events: { url: string; eventDate: string; hasMatches: boolean }[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [running, setRunning] = useState<string | null>(null);

  const run = (event: { url: string; eventDate: string }) =>
    startTransition(async () => {
      setRunning(event.url + event.eventDate);
      const result = await importLocatorMatchesAction({ gameId, event: event.url, source, eventDate: event.eventDate.slice(0, 10) });
      setRunning(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.matches} matchs importés entre ${result.players} joueurs.`);
      router.refresh();
    });

  return (
    <>
      {events.map((event) => {
        const key = event.url + event.eventDate;
        const when = events.length > 1 ? ` du ${dateFormat.format(new Date(event.eventDate))}` : "";
        return (
          <div
            key={key}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm"
          >
            <span className="text-muted-foreground">
              {event.hasMatches
                ? `Les matchs du tournoi${when} sont importés : ses winrates et ses matchups sont en ligne.`
                : `Le tournoi${when} a été importé sans ses matchs : ni winrates ni matchups pour lui.`}
            </span>
            <Button variant={event.hasMatches ? "ghost" : "default"} size="sm" disabled={busy} onClick={() => run(event)}>
              {running === key && <Loader2 className="animate-spin" aria-hidden />}
              {event.hasMatches ? "Réimporter les matchs" : "Importer les matchs"}
            </Button>
          </div>
        );
      })}
    </>
  );
}
