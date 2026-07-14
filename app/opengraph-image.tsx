import { buildOgImage } from "@/lib/og";

export const dynamic = "force-dynamic";

export const alt = "Joutes - Ligues et rencontres multi-jeux à proximité";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return buildOgImage({
    title: "Ligues et rencontres multi-jeux à proximité",
    subtitle:
      "Organisez et trouvez des événements, gérez vos decks, votre collection et vos wishlists entre passionnés.",
    variant: "home",
  });
}
