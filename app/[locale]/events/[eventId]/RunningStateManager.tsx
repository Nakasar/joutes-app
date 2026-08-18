"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Play, CheckCircle } from "lucide-react";
import { startEventAction, completeEventAction } from "../actions";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type RunningStateManagerProps = {
  eventId: string;
  runningState?: 'not-started' | 'ongoing' | 'completed';
};

export default function RunningStateManager({ eventId, runningState = 'not-started' }: RunningStateManagerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await startEventAction(eventId);

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

  const handleComplete = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await completeEventAction(eventId);

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

  return (
    <div className="space-y-2">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {runningState === 'not-started' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              disabled={loading}
              className="w-full"
              variant="default"
            >
              <Play className="h-4 w-4 mr-2" />
              {loading ? "Chargement..." : "Démarrer l'événement"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Démarrer l&apos;événement</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir démarrer cet événement ? Une fois démarré, les utilisateurs ne pourront plus s&apos;inscrire en tant que participants.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleStart}>
                Démarrer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {runningState === 'ongoing' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              disabled={loading}
              className="w-full"
              variant="default"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {loading ? "Chargement..." : "Terminer l'événement"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Terminer l&apos;événement</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir terminer cet événement ? Cette action marquera l&apos;événement comme terminé.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleComplete}>
                Terminer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {runningState === 'completed' && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Cet événement est terminé
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
