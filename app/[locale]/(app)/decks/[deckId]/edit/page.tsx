import { Suspense } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";

import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { getDeckById } from "@/lib/db/decks.ts";
import { getGameById } from "@/lib/db/games.ts";
import { getDeckCardInfos } from "@/lib/db/deck-cards.ts";
import { deckCardIds } from "@/lib/decks/contents.ts";
import { getDeckCollectionCounts } from "@/lib/decks/collection.ts";
import { riftboundDeckCode } from "@/lib/decks/export-code.ts";
import { getDeckZones } from "@/lib/decks/zones.ts";
import { DeckEditor } from "./DeckEditor.tsx";

type Params = Promise<{ deckId: string }>;

/** Nombre d'exemplaires d'une même carte que le format autorise, quand il en fixe un. */
const COPY_LIMITS: Record<string, number> = { riftbound: 3 };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  // Le pilote Mongo touche à l'horloge en lisant la base, ce qu'un prérendu
  // ne sait pas figer. Les métadonnées s'exécutent hors de la frontière de la
  // page : le déblocage du corps ne les couvre pas.
  await connection();

  const { deckId } = await params;
  const deck = await getDeckById(deckId);

  if (!deck) {
    return {
      title: "Deck non trouvé",
    };
  }

  return {
    title: `Construire ${deck.name}`,
    description: `Construire et corriger le deck ${deck.name}`,
    // L'éditeur d'un deck ne concerne que son auteur, quelle que soit la
    // visibilité du deck lui-même.
    robots: { index: false, follow: false },
  };
}

async function EditDeckPageContent({ params }: { params: Params }) {
  const { deckId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect("/login");
  }

  const deck = await getDeckById(deckId);

  if (!deck) {
    notFound();
  }

  if (deck.playerId !== session.user.id) {
    redirect(`/decks/${deckId}`);
  }

  const game = await getGameById(deck.gameId);
  const zones = getDeckZones(game);
  const catalog = await getDeckCardInfos(deck.gameId, deckCardIds(deck.cards));
  const ownedByCardId = await getDeckCollectionCounts(
    session.user.id,
    deck.gameId,
    deck.cards,
    new Map(catalog.map((card) => [card.id, card]))
  );

  return (
    <div className="container mx-auto max-w-[1400px] px-4 py-8">
      <DeckEditor
        deck={deck}
        gameName={game?.name}
        gameSlug={game?.slug ?? deck.gameId}
        zones={zones}
        initialCatalog={catalog}
        ownedByCardId={Object.fromEntries(ownedByCardId)}
        copyLimit={game?.slug ? COPY_LIMITS[game.slug] : undefined}
        exportCode={game?.slug === "riftbound" ? riftboundDeckCode(deck.cards) : undefined}
      />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function EditDeckPage(props: Parameters<typeof EditDeckPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-[1400px] px-4 py-8">
          <EditorFormSkeleton fields={6} label="Chargement de l'éditeur" />
        </div>
      }
    >
      <EditDeckPageContent {...props} />
    </Suspense>
  );
}
