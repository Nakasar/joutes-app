import { buildOgImage } from "@/lib/og";

export const dynamic = "force-dynamic";

export const alt = "Communauté - Joutes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return buildOgImage({
    title: "Rejoignez la communauté",
    subtitle: "Découvrez les profils des joueurs : collections, decks et jeux favoris.",
    variant: "users",
  });
}
