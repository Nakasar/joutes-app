"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Crée une ronde dans la phase choisie puis redirige vers sa page de détail.
export function CreateRoundControl({
  tournamentId,
  phases,
}: {
  tournamentId: string;
  phases: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [phaseId, setPhaseId] = useState(phases[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (phases.length === 0) return null;

  const create = async () => {
    if (!phaseId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/phases/${phaseId}/rounds`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Erreur lors de la création de la ronde");
      }
      const round = await res.json();
      router.push(`/tournaments/${tournamentId}/organizer/rounds/${round.id}/matches`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création de la ronde");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Select value={phaseId} onValueChange={setPhaseId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Choisir une phase" />
          </SelectTrigger>
          <SelectContent>
            {phases.map((phase) => (
              <SelectItem key={phase.id} value={phase.id}>
                {phase.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={create} disabled={busy || !phaseId}>
          <Plus className="mr-2 h-4 w-4" />
          Créer une ronde
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
