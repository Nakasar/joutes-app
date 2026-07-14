import { getTranslations } from "next-intl/server";
import { buildOgImage } from "@/lib/og";

export const dynamic = "force-dynamic";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const t = await getTranslations("Games.Developers");
  return buildOgImage({
    title: t("metadata.ogTitle"),
    subtitle: t("metadata.ogDescription"),
    variant: "integrations",
  });
}
