import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";
import {ImageResponse} from "next/og";

export const alt = "Groupes de jeu - Joutes";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default async function Image(): Promise<ImageResponse> {
  return buildOgImage({
    title: "Groupes de jeu",
    subtitle: "Partagez collections et wishlists, invitez des membres et organisez vos parties.",
    variant: "playGroups",
  });
}
