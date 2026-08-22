import { Suspense } from "react";
import { headers } from "next/headers";
import { after, connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";

import { AccountPanelSkeleton } from "@/components/AccountPanelSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { getDeckById, incrementDeckViews } from "@/lib/db/decks.ts";
import { getGameById } from "@/lib/db/games.ts";
import { getDeckCardInfos } from "@/lib/db/deck-cards.ts";
import { deckCardIds } from "@/lib/decks/contents.ts";
import { getDeckCollectionCounts } from "@/lib/decks/collection.ts";
import { riftboundDeckCode } from "@/lib/decks/export-code.ts";
import { getDeckZones } from "@/lib/decks/zones.ts";
import { isDeckIndexable } from "@/lib/types/Deck.ts";
import { DeckSheet } from "./DeckSheet.tsx";
import { PublicDeckSheet } from "./PublicDeckSheet.tsx";

type Params = Promise<{ deckId: string }>;

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

  // Un deck privé n'est visible que de son auteur, et un deck non répertorié ne
  // s'atteint que par son lien : ni l'un ni l'autre n'a sa place dans un index.
  if (!isDeckIndexable(deck.visibility)) {
    return {
      title: deck.name,
      robots: { index: false, follow: false },
    };
  }

  return {
    title: deck.name,
    description: deck.description || `Deck ${deck.name}`,
    openGraph: {
      title: `${deck.name} - Joutes`,
      description: deck.description || `Deck ${deck.name}`,
    },
  };
}

async function DeckPageContent({ params }: { params: Params }) {
  const { deckId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const deck = await getDeckById(deckId);

  if (!deck) {
    notFound();
  }

  // Un deck non répertorié s'ouvre comme un deck public : c'est le lien qui
  // fait l'autorisation. Seul le privé se referme sur son auteur.
  const isOwner = deck.playerId === session?.user?.id;
  if (deck.visibility === "private" && !isOwner) {
    redirect("/decks");
  }

  const game = await getGameById(deck.gameId);
  const zones = getDeckZones(game);
  const catalog = await getDeckCardInfos(deck.gameId, deckCardIds(deck.cards));
  const isFavorited = Boolean(session?.user && deck.favoritedBy?.includes(session.user.id));

  if (!isOwner) {
    // Le compteur ne doit pas retarder la page : la vue se compte une fois
    // celle-ci envoyée, et son échec ne casse rien.
    after(() => incrementDeckViews(deck.id));

    const ownedByCardId = session?.user?.id
      ? await getDeckCollectionCounts(
          session.user.id,
          deck.gameId,
          deck.cards,
          new Map(catalog.map((card) => [card.id, card]))
        )
      : undefined;

    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <PublicDeckSheet
          deck={{ ...deck, notes: undefined }}
          gameName={game?.name}
          zones={zones}
          catalog={catalog}
          isFavorited={isFavorited}
          isAuthenticated={Boolean(session?.user?.id)}
          ownedByCardId={ownedByCardId ? Object.fromEntries(ownedByCardId) : undefined}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <DeckSheet
        deck={deck}
        gameName={game?.name}
        zones={zones}
        catalog={catalog}
        isFavorited={isFavorited}
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
export default function DeckPage(props: Parameters<typeof DeckPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-7xl px-4 py-8">
          <AccountPanelSkeleton cards={3} label="Chargement du deck" />
        </div>
      }
    >
      <DeckPageContent {...props} />
    </Suspense>
  );
}
