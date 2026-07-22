"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function NewTournamentForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [allowSelfReporting, setAllowSelfReporting] = useState(true);
  const [requireConfirmation, setRequireConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Le nom du tournoi est requis.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          settings: { allowSelfReporting, requireConfirmation },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Erreur lors de la création du tournoi");
      }
      const tournament = await res.json();
      router.push(`/tournaments/${tournament.id}/organizer`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création du tournoi");
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouveau tournoi</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tournament-name">Nom du tournoi</Label>
            <Input
              id="tournament-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Tournoi hebdomadaire Riftbound"
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="allow-self-reporting">Rapport de score par les joueurs</Label>
              <p className="text-sm text-muted-foreground">
                Les joueurs peuvent saisir eux-mêmes le résultat de leurs matchs.
              </p>
            </div>
            <Switch
              id="allow-self-reporting"
              checked={allowSelfReporting}
              onCheckedChange={setAllowSelfReporting}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="require-confirmation">Confirmation par l&apos;adversaire</Label>
              <p className="text-sm text-muted-foreground">
                Un résultat rapporté par un joueur doit être confirmé par son adversaire.
              </p>
            </div>
            <Switch
              id="require-confirmation"
              checked={requireConfirmation}
              onCheckedChange={setRequireConfirmation}
            />
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? "Création..." : "Créer le tournoi"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
