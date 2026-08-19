"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { setBanStatus } from "@/app/[locale]/(app)/games/[gameSlugOrId]/actions.ts";
import { useTranslations } from "next-intl";

export default function BanCardButton({
  cardId,
  banned,
}: {
  cardId: string;
  banned?: boolean;
}) {
  const [isPending, setIsPending] = useState(false);
  const t = useTranslations("Games");

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
      {isPending ? t("cards.detail.banButton.pending") : banned ? t("cards.detail.banButton.unban") : t("cards.detail.banButton.ban")}
    </Button>
  );
}
