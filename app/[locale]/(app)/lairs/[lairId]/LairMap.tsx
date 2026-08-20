import { getTranslations } from "next-intl/server";
import { MapPin } from "lucide-react";

import type { GeoJSONPoint } from "@/lib/types/Lair";

/**
 * La carte du lieu.
 *
 * OpenStreetMap plutôt qu'un fournisseur à clé : la vignette n'a rien à faire
 * de plus que situer une adresse, et une clé d'API pour cela ferait dépendre
 * l'affichage d'un secret de déploiement.
 *
 * Sans coordonnées, rien n'est rendu — un cadre gris à la place d'une carte ne
 * renseigne personne.
 */
export default async function LairMap({
  location,
  name,
  className = "h-[130px]",
}: {
  location?: GeoJSONPoint;
  name: string;
  className?: string;
}) {
  if (!location) {
    return null;
  }

  const t = await getTranslations("Lairs.portal.info");
  const [longitude, latitude] = location.coordinates;
  const span = 0.006;
  const bbox = [longitude - span, latitude - span / 2, longitude + span, latitude + span / 2].join(",");

  return (
    <div className={`relative overflow-hidden rounded-lg border bg-muted ${className}`}>
      <iframe
        title={t("mapTitle", { name })}
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`}
        loading="lazy"
        className="h-full w-full border-0 grayscale-[.35]"
      />
      <MapPin className="pointer-events-none absolute top-2 right-2 size-3.5 text-muted-foreground" aria-hidden />
    </div>
  );
}
