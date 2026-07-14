import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";
import {ImageResponse} from "next/og";

export const alt = "Ligues - Joutes";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default async function Image(): Promise<ImageResponse> {
  return buildOgImage({
    title: "Ligues et tournois",
    subtitle: "Découvrez les ligues et tournois de jeux près de chez vous, et suivez les classements.",
    variant: "leagues",
  });
}
