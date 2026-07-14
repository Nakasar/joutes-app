import { buildOgImage } from "@/lib/og";

export const dynamic = "force-dynamic";

export const alt = "Jeux - Joutes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return buildOgImage({
    title: "Explorez les jeux",
    subtitle: "Jeux de cartes à collectionner et jeux de plateau : règles, cartes et rulings.",
    variant: "games",
  });
}
