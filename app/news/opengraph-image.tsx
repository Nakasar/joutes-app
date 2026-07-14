import { buildOgImage } from "@/lib/og";

export const dynamic = "force-dynamic";

export const alt = "Actualités - Joutes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return buildOgImage({
    title: "Actualités de la communauté",
    subtitle: "Annonces, extensions, événements et mises à jour des jeux de la communauté Joutes.",
    variant: "news",
  });
}
