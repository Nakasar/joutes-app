import { buildOgImage } from "@/lib/og";

export const dynamic = "force-dynamic";

export const alt = "Historique des parties - Joutes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return buildOgImage({
    title: "Historique des parties",
    subtitle: "Enregistrez vos résultats, adversaires et statistiques de jeu.",
    variant: "gameMatches",
  });
}
