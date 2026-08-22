"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { usePriceSourceAction } from "@/app/[locale]/(app)/account/price-actions.ts";
import type { CardPriceSource } from "@/lib/types/card-price";

/**
 * « Utiliser » : ce fournisseur-là devient celui de toutes les cartes du
 * joueur, partout.
 *
 * Le réglage est général alors que le geste est local — une fiche de carte,
 * une place de marché qui affiche 0,31 € quand l'autre dit 0,25 €. D'où la
 * confirmation, qui en dit la portée : sans elle, le joueur croirait n'avoir
 * changé que cette carte-là.
 *
 * Le rafraîchissement redemande la page au serveur : c'est lui qui choisit le
 * relevé qui représente une carte, et la fiche doit se réordonner sous les
 * yeux du joueur pour que le geste se voie.
 */
export default function UsePriceSourceButton({
  source,
  market,
}: {
  source: CardPriceSource;
  market: string;
}) {
  const t = useTranslations("Prices");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const choose = async () => {
    setSaving(true);
    const result = await usePriceSourceAction(source);
    setSaving(false);

    if (!result.success) {
      toast.error(t("useFailed"));
      return;
    }

    toast.success(t("useDone", { market }), { description: t("useScope") });
    startTransition(() => router.refresh());
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 shrink-0 px-2.5 text-[11px]"
      disabled={saving || pending}
      onClick={choose}
    >
      {t("use")}
    </Button>
  );
}
