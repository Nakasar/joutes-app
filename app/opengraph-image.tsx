import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";

export const alt = "Joutes - Ligues et rencontres multi-jeux à proximité";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return buildOgImage({
    title: "Ligues et rencontres multi-jeux à proximité",
    subtitle:
      "Organisez et trouvez des événements, gérez vos decks, votre collection et vos wishlists entre passionnés.",
    variant: "home",
  });
}
