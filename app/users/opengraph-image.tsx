import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";

export const alt = "Communauté - Joutes";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return buildOgImage({
    title: "Rejoignez la communauté",
    subtitle: "Découvrez les profils des joueurs : collections, decks et jeux favoris.",
    variant: "users",
  });
}
