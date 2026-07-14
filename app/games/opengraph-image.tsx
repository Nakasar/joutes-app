import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";

export const alt = "Jeux - Joutes";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return buildOgImage({
    title: "Explorez les jeux",
    subtitle: "Jeux de cartes à collectionner et jeux de plateau : règles, cartes et rulings.",
    variant: "games",
  });
}
