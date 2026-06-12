"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { setBanStatus } from "@/app/games/[gameSlugOrId]/actions";

export default function BanCardButton({
  cardId,
  banned,
}: {
  cardId: string;
  banned?: boolean;
}) {
  const [isPending, setIsPending] = useState(false);

  const handleClick = async () => {
    setIsPending(true);
    try {
      await setBanStatus(cardId, !banned);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button
      variant={banned ? "outline" : "destructive"}
      size="sm"
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? "..." : banned ? "Retirer le ban" : "Bannir la carte"}
    </Button>
  );
}
