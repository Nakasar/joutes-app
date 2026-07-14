import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";
import {ImageResponse} from "next/og";

export const alt = "À propos - Joutes";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default async function Image(): Promise<ImageResponse> {
  return buildOgImage({
    title: "À propos de Joutes",
    subtitle: "La plateforme qui connecte les passionnés de jeux de cartes et de société avec leur communauté locale.",
    variant: "home",
  });
}
