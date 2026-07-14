import { getTranslations } from "next-intl/server";
import { buildOgImage } from "@/lib/og";

export const dynamic = "force-dynamic";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const t = await getTranslations("Lairs");
  return buildOgImage({
    title: t("page.title"),
    subtitle: t("page.description"),
    variant: "lairs",
  });
}
