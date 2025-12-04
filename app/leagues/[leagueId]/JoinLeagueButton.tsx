"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, UserPlus } from "lucide-react";
import { joinLeagueAction } from "../actions";

type JoinLeagueButtonProps = {
  leagueId: string;
};

export default function JoinLeagueButton({ leagueId }: JoinLeagueButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await joinLeagueAction(leagueId);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de l'inscription");
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
      <Button onClick={handleJoin} disabled={loading}>
        {loading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <UserPlus className="h-4 w-4 mr-2" />
        )}
        Rejoindre
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
