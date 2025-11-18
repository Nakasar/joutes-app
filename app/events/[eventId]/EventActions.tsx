"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { joinEventAction, leaveEventAction } from "../actions";
import { useRouter } from "next/navigation";

type EventActionsProps = {
  eventId: string;
  isParticipant: boolean;
  isCreator: boolean;
  isFull: boolean;
};

export default function EventActions({ eventId, isParticipant, isCreator, isFull }: EventActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await joinEventAction(eventId);

      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Une erreur est survenue");
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm("Êtes-vous sûr de vouloir vous désinscrire de cet événement ?")) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await leaveEventAction(eventId);

      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Une erreur est survenue");
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  if (isCreator) {
    return (
      <Alert>
        <AlertDescription>
          Vous êtes le créateur de cet événement
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isParticipant ? (
        <Button
          onClick={handleLeave}
          disabled={loading}
          variant="outline"
          className="w-full"
        >
          {loading ? "Chargement..." : "Se désinscrire"}
        </Button>
      ) : (
        <Button
          onClick={handleJoin}
          disabled={loading || isFull}
          className="w-full"
        >
          {loading ? "Chargement..." : isFull ? "Événement complet" : "S&apos;inscrire"}
        </Button>
      )}
    </div>
  );
}
