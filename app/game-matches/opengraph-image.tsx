import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";
import {ImageResponse} from "next/og";

export const alt = "Historique des parties - Joutes";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default async function Image(): Promise<ImageResponse> {
  return buildOgImage({
    title: "Historique des parties",
    subtitle: "Enregistrez vos résultats, adversaires et statistiques de jeu.",
    variant: "gameMatches",
  });
}
