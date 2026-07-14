import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";

export const alt = "Decks - Joutes";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return buildOgImage({
    title: "Construisez vos decks",
    subtitle: "Gérez vos decks, vérifiez leur légalité et analysez votre courbe de coûts.",
    variant: "decks",
  });
}
