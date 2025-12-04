"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, UserMinus } from "lucide-react";
import { leaveLeagueAction } from "../actions";

type LeaveLeagueButtonProps = {
  leagueId: string;
};

export default function LeaveLeagueButton({ leagueId }: LeaveLeagueButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLeave = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await leaveLeagueAction(leagueId);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de la désinscription");
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={handleLeave} disabled={loading}>
        {loading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <UserMinus className="h-4 w-4 mr-2" />
        )}
        Quitter
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
