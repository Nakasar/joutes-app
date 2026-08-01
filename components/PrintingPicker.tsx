"use client";

import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CardPrinting } from "@/lib/types/card";

/**
 * Choix de la variante d'impression d'une carte, partagé par tous les écrans
 * qui enregistrent un exemplaire (collection, booster, wishlist). N'affiche
 * rien quand la carte n'a pas de variante : la version de base est alors le
 * seul choix possible.
 */
export default function PrintingPicker({
  printings,
  value,
  onChange,
  id = "printing",
  className,
}: {
  printings?: CardPrinting[];
  /** Identifiant de la variante choisie ; vide = version de base. */
  value: string;
  onChange: (printingId: string) => void;
  id?: string;
  className?: string;
}) {
  const t = useTranslations("Printings");

  if (!printings || printings.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id}>{t("label")}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-3 py-2 border border-input rounded-lg bg-transparent text-sm focus:ring-2 focus:ring-ring focus:border-transparent"
      >
        <option value="">{t("base")}</option>
        {printings.map((printing) => (
          <option key={printing.id} value={printing.id}>
            {printing.foil ? t("foilOption", { name: printing.name }) : printing.name}
          </option>
        ))}
      </select>
    </div>
  );
}
