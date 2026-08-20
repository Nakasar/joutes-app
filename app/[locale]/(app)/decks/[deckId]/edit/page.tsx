import { Suspense } from "react";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import { getDeckById } from "@/lib/db/decks.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";
import EditDeckForm from "./EditDeckForm.tsx";

type Params = Promise<{ deckId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { deckId } = await params;
  const deck = await getDeckById(deckId);

  if (!deck) {
    return {
      title: "Deck non trouvé",
    };
  }

  return {
    title: `Modifier ${deck.name}`,
    description: `Modifier les informations du deck ${deck.name}`,
  };
}

async function EditDeckPageContent({ params }: { params: Params }) {
  const { deckId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Vérifier l'authentification
  if (!session?.user?.id) {
    redirect("/login");
  }

  const deck = await getDeckById(deckId);

  if (!deck) {
    notFound();
  }

  // Vérifier que l'utilisateur est le propriétaire du deck
  const isOwner = deck.playerId === session.user.id;
  if (!isOwner) {
    redirect(`/decks/${deckId}`);
  }

  // Récupérer la liste des jeux pour le sélecteur
  const games = await getAllGames();

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Modifier le deck</h1>
          <p className="text-muted-foreground mt-2">
            Modifiez les informations de votre deck.
          </p>
        </div>

        <EditDeckForm deck={deck} games={games} />
      </div>
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
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <EditorFormSkeleton fields={4} label="Chargement du deck" />
        </div>
      }
    >
      <EditDeckPageContent {...props} />
    </Suspense>
  );
}
