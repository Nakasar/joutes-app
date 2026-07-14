import { buildOgImage } from "@/lib/og";

export const dynamic = "force-dynamic";

export const alt = "Ligues - Joutes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return buildOgImage({
    title: "Ligues et tournois",
    subtitle: "Découvrez les ligues et tournois de jeux près de chez vous, et suivez les classements.",
    variant: "leagues",
  });
}
