import type { Metadata } from 'next';
import {RiftboundDeckChecker} from "@/app/[locale]/(app)/games/riftbound/deck-checker/deck-checker.tsx";
import {getTranslations} from "next-intl/server";
import {Button} from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import {GameToolsNavBar} from "@/components/games/GameToolsNavBar.tsx";
import {notFound} from "next/navigation";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";


// Blocage délibéré, pas une étape d'adoption restante.
//
// `generateMetadata` lit `?input=` pour choisir l'image de partage : un lien de
// deck partagé produit l'aperçu de ce deck, pas l'image générique. Les
// métadonnées se calculent hors de toute frontière `<Suspense>`, donc cette
// dépendance à l'URL rend la route dynamique par construction. La retirer
// rendrait la page prérendable au prix de l'aperçu, ce qui n'est pas un bon
// échange pour une page faite pour être partagée.
export const instant = false;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ input?: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("Games.DeckChecker");
  const { input } = await searchParams;

  // app/.../opengraph-image/route.ts génère la preview à la volée : la
  // grille de cartes du deck si ?input= est fourni, sinon le mockup
  // générique. Comme ce n'est pas le fichier de convention spécial de Next
  // (juste une route classique), il faut la référencer explicitement ici.
  const previewImageUrl =
    input && input.length > 10
      ? `/games/riftbound/deck-checker/opengraph-image?input=${encodeURIComponent(input)}`
      : `/games/riftbound/deck-checker/opengraph-image`;

  return {
    title: `Joutes - ${t("title")}`,
    description: t("description"),
    keywords: ["deck checker", "riftbound", "légalité de deck", "vérification de deck"],
    openGraph: {
      url: `https://joutes.app/games/riftbound/deck-checker`,
      siteName: `Joutes`,
      title: `Joutes - ${t("title")}`,
      description: t("description"),
      images: [{ url: previewImageUrl, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", images: [previewImageUrl] },
  };
}

type SearchParams = Promise<{ input?: string }>;

export default async function RiftboundDeckCheckerPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations("Games.DeckChecker");

  const { input } = await searchParams;
  const game = await readGameBySlugOrId("riftbound");
  if (!game || !game.slug) notFound();

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-row flex-wrap justify-between">
        <div className="flex flex-row flex-wrap gap-4">
          <Button asChild>
            <Link href={`/games/riftbound`} className="text-blue-600 hover:underline">
              ← <span className="hidden lg:inline">{t("back")}</span>
            </Link>
          </Button>
          <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>
        </div>
        <GameToolsNavBar gameSlug="riftbound" currentTab={'deckChecker'} />
      </div>

      <RiftboundDeckChecker input={input} />
    </div>
  )
}
