import { buildOgImage } from "@/lib/og";

export const dynamic = "force-dynamic";

export const alt = "Decks - Joutes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return buildOgImage({
    title: "Construisez vos decks",
    subtitle: "Gérez vos decks, vérifiez leur légalité et analysez votre courbe de coûts.",
    variant: "decks",
  });
}
