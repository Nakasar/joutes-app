import { buildOgImage, ogImageContentType, ogImageSize } from "@/lib/og";
import {ImageResponse} from "next/og";

export const alt = "Événements - Joutes";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default async function Image(): Promise<ImageResponse> {
  return buildOgImage({
    title: "Trouvez vos évènements",
    subtitle: "Tournois, organized play et rencontres locales autour de vos jeux préférés.",
    variant: "events",
  });
}
