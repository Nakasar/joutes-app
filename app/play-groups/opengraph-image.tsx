import { buildOgImage } from "@/lib/og";

export const dynamic = "force-dynamic";

export const alt = "Groupes de jeu - Joutes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return buildOgImage({
    title: "Groupes de jeu",
    subtitle: "Partagez collections et wishlists, invitez des membres et organisez vos parties.",
    variant: "playGroups",
  });
}
