import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";
import {ImageResponse} from "next/og";

export const alt = "Actualités - Joutes";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default async function Image(): Promise<ImageResponse> {
  return buildOgImage({
    title: "Actualités de la communauté",
    subtitle: "Annonces, extensions, événements et mises à jour des jeux de la communauté Joutes.",
    variant: "news",
  });
}
