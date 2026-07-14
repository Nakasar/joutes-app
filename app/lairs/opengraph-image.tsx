import { getTranslations } from "next-intl/server";
import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";
import {ImageResponse} from "next/og";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export default async function Image(): Promise<ImageResponse> {
  const t = await getTranslations("Lairs");
  return buildOgImage({
    title: t("page.title"),
    subtitle: t("page.description"),
    variant: "lairs",
  });
}
