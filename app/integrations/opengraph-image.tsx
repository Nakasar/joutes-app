import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";
import {ImageResponse} from "next/og";

export const alt = "Documentation pour intégrations - Joutes";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default async function Image(): Promise<ImageResponse> {
  return buildOgImage({
    title: "Intégrations développeurs",
    subtitle: "Discord, API REST et serveur MCP pour connecter vos outils et agents IA à Joutes.",
    variant: "integrations",
  });
}
