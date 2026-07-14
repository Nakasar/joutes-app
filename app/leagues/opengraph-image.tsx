import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";

export const alt = "Ligues - Joutes";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return buildOgImage({
    title: "Ligues et tournois",
    subtitle: "Découvrez les ligues et tournois de jeux près de chez vous, et suivez les classements.",
    variant: "leagues",
  });
}
