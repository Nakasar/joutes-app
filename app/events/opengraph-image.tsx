import { buildOgImage } from "@/lib/og";

export const dynamic = "force-dynamic";

export const alt = "Événements - Joutes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return buildOgImage({
    title: "Trouvez vos évènements",
    subtitle: "Tournois, organized play et rencontres locales autour de vos jeux préférés.",
    variant: "events",
  });
}
