'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {Loader2, Target, UserMinus} from "lucide-react";
import {assignTargetsToPlayerAction, leaveLeagueAction} from "../actions";

type GetTargetsButtonProps = {
  leagueId: string;
};

export default function GetTargetsButton({ leagueId }: GetTargetsButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGetTargets = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await assignTargetsToPlayerAction();
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de l'obtention des cibles");
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="">
      <Button variant="default" onClick={handleGetTargets} disabled={loading}>
        {loading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Target className="h-4 w-4 mr-2" />
        )}
        Obtenir mes cibles
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
