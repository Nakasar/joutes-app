import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";
import {ImageResponse} from "next/og";

export const alt = "Decks - Joutes";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default async function Image(): Promise<ImageResponse> {
  return buildOgImage({
    title: "Construisez vos decks",
    subtitle: "Gérez vos decks, vérifiez leur légalité et analysez votre courbe de coûts.",
    variant: "decks",
  });
}
