import { getTranslations } from "next-intl/server";
import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export default async function Image() {
  const t = await getTranslations("Lairs");
  return buildOgImage({
    title: t("page.title"),
    subtitle: t("page.description"),
    variant: "lairs",
  });
}
