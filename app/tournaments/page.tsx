"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSyncKeys, removeSyncKey } from "@/lib/tournament-sync-storage";

type SyncedTournament = {
  key: string;
  tournament: {
    id: string;
    name: string;
    status: "draft" | "in-progress" | "completed";
    createdAt: string;
  };
  player: { id: string; displayName: string; status: string };
};

type OrganizedTournament = {
  id: string;
  name: string;
  status: "draft" | "in-progress" | "completed";
  createdAt: string;
};

type StatusFilter = "all" | "in-progress" | "draft" | "completed";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "in-progress", label: "En cours" },
  { value: "draft", label: "À venir" },
  { value: "completed", label: "Passés" },
];

const STATUS_LABELS: Record<string, string> = {
  draft: "À venir",
  "in-progress": "En cours",
  completed: "Terminé",
};

export default function TournamentsPage() {
  const [entries, setEntries] = useState<SyncedTournament[]>([]);
  const [organized, setOrganized] = useState<OrganizedTournament[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [hasKeys, setHasKeys] = useState(false);

  useEffect(() => {
    const keys = Object.values(getSyncKeys());
    setHasKeys(keys.length > 0);

    // Tournois organisés par l'utilisateur connecté (session ; renvoie [] si
    // non authentifié).
    const organizedPromise = fetch("/api/tournaments")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: OrganizedTournament[]) => setOrganized(Array.isArray(data) ? data : []))
      .catch(() => setOrganized([]));

    // Tournois synchronisés sur ce navigateur via une clé de joueur.
    const syncedPromise =
      keys.length === 0
        ? Promise.resolve()
        : fetch("/api/tournaments/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keys }),
          })
            .then((res) => (res.ok ? res.json() : []))
            .then((data: SyncedTournament[]) => setEntries(Array.isArray(data) ? data : []))
            .catch(() => setEntries([]));

    Promise.all([organizedPromise, syncedPromise]).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => entries.filter((e) => filter === "all" || e.tournament.status === filter),
    [entries, filter]
  );

  const filteredOrganized = useMemo(
    () => organized.filter((t) => filter === "all" || t.status === filter),
    [organized, filter]
  );

  const handleRemove = (tournamentId: string) => {
    if (!confirm("Retirer ce tournoi de cette page ? La clé de synchronisation sera supprimée de ce navigateur.")) {
      return;
    }
    removeSyncKey(tournamentId);
    setEntries((current) => current.filter((e) => e.tournament.id !== tournamentId));
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mes tournois</h1>
          <p className="text-muted-foreground mt-1">
            Les tournois que vous organisez et ceux synchronisés avec ce navigateur. Scannez le
            QR code fourni par un organisateur pour rejoindre un tournoi comme joueur.
          </p>
        </div>
        <Button asChild>
          <Link href="/tournaments/new">
            <Plus className="h-4 w-4 mr-2" />
            Créer un tournoi
          </Link>
        </Button>
      </div>

      <div className="flex gap-2">
        {FILTERS.map(({ value, label }) => (
          <Button
            key={value}
            variant={filter === value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {!loading && filteredOrganized.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Tournois que j&apos;organise</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {filteredOrganized.map((t) => (
              <Card key={t.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg">{t.name}</CardTitle>
                  <Badge variant="secondary">{STATUS_LABELS[t.status] ?? t.status}</Badge>
                </CardHeader>
                <CardContent>
                  <Button asChild size="sm">
                    <Link href={`/tournaments/${t.id}/organizer`}>Gérer</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Tournois où je joue</h2>

      {loading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : !hasKeys ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Aucun tournoi synchronisé sur ce navigateur pour le moment.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Aucun tournoi ne correspond à ce filtre.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((entry) => (
            <Card key={entry.tournament.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-lg">{entry.tournament.name}</CardTitle>
                <Badge variant="secondary">
                  {STATUS_LABELS[entry.tournament.status] ?? entry.tournament.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Inscrit en tant que <span className="font-medium">{entry.player.displayName}</span>
                  {entry.player.status === "dropped" ? " (drop)" : ""}
                </p>
                <div className="flex items-center justify-between">
                  <Button asChild size="sm">
                    <Link href={`/tournaments/${entry.tournament.id}/player`}>Portail joueur</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-800"
                    onClick={() => handleRemove(entry.tournament.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </section>
    </div>
  );
}
