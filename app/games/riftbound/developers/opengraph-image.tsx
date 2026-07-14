import { getTranslations } from "next-intl/server";
import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";
import {ImageResponse} from "next/og";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export default async function Image(): Promise<ImageResponse> {
  const t = await getTranslations("Games.Developers");
  return buildOgImage({
    title: t("metadata.ogTitle"),
    subtitle: t("metadata.ogDescription"),
    variant: "integrations",
  });
}
