import { buildOgImage } from "@/lib/og";

export const dynamic = "force-dynamic";

export const alt = "À propos - Joutes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return buildOgImage({
    title: "À propos de Joutes",
    subtitle: "La plateforme qui connecte les passionnés de jeux de cartes et de société avec leur communauté locale.",
    variant: "home",
  });
}
