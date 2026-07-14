import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";
import {ImageResponse} from "next/og";

export const alt = "Communauté - Joutes";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default async function Image(): Promise<ImageResponse> {
  return buildOgImage({
    title: "Rejoignez la communauté",
    subtitle: "Découvrez les profils des joueurs : collections, decks et jeux favoris.",
    variant: "users",
  });
}
