import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";

export const alt = "À propos - Joutes";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return buildOgImage({
    title: "À propos de Joutes",
    subtitle: "La plateforme qui connecte les passionnés de jeux de cartes et de société avec leur communauté locale.",
    variant: "home",
  });
}
