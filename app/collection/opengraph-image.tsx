import { getTranslations } from "next-intl/server";
import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export default async function Image() {
  const t = await getTranslations("Collection");
  return buildOgImage({
    title: t("metadata.title"),
    subtitle: t("metadata.description"),
    variant: "collection",
  });
}
