import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";

export const alt = "Historique des parties - Joutes";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return buildOgImage({
    title: "Historique des parties",
    subtitle: "Enregistrez vos résultats, adversaires et statistiques de jeu.",
    variant: "gameMatches",
  });
}
