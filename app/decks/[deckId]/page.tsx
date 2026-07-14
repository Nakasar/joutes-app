import { getDeckById } from "@/lib/db/decks";
import { getGameById } from "@/lib/db/games";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";
import { Library, Eye, EyeOff, ExternalLink, Edit } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { DateTime } from "luxon";
import DeleteDeckButton from "./DeleteDeckButton";
import FavoriteDeckButton from "../FavoriteDeckButton";

type Params = Promise<{ deckId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { deckId } = await params;
  const deck = await getDeckById(deckId);

  if (!deck) {
    return {
      title: "Deck non trouvé",
    };
  }

  // Les decks privés ne sont visibles que par leur propriétaire (la page redirige
  // les autres utilisateurs) : on évite de les indexer ou d'en exposer le détail.
  if (deck.visibility === "private") {
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

export default async function DeckPage({ params }: { params: Params }) {
  const { deckId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const deck = await getDeckById(deckId);

  if (!deck) {
    notFound();
  }

  // Vérifier les permissions : le deck doit être public ou appartenir à l'utilisateur connecté
  const isOwner = deck.playerId === session?.user?.id;
  if (deck.visibility === "private" && !isOwner) {
    redirect("/decks");
  }

  const game = await getGameById(deck.gameId);
  const createdAt = DateTime.fromJSDate(new Date(deck.createdAt)).setLocale("fr");
  const updatedAt = DateTime.fromJSDate(new Date(deck.updatedAt)).setLocale("fr");
  const isFavorited = Boolean(session?.user && deck.favoritedBy?.includes(session.user.id));

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Link
                href="/decks"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Library className="h-5 w-5" />
              </Link>
              <span className="text-muted-foreground">/</span>
              <h1 className="text-4xl font-bold tracking-tight">{deck.name}</h1>
            </div>
            {game && (
              <div className="flex items-center gap-2 text-muted-foreground">
                {game.icon && (
                  <img src={game.icon} alt={game.name} className="h-5 w-5 object-contain" />
                )}
                <span>{game.name}</span>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Créé par {deck.creatorName || "un joueur"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={deck.visibility === "public" ? "default" : "secondary"}>
              {deck.visibility === "public" ? (
                <>
                  <Eye className="h-3 w-3 mr-1" />
                  Public
                </>
              ) : (
                <>
                  <EyeOff className="h-3 w-3 mr-1" />
                  Privé
                </>
              )}
            </Badge>
            {session?.user?.id && (
              <FavoriteDeckButton deckId={deck.id} isFavorited={isFavorited} />
            )}
            {isOwner && (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/decks/${deck.id}/edit`}>
                    <Edit className="h-4 w-4 mr-2" />
                    Modifier
                  </Link>
                </Button>
                <DeleteDeckButton deckId={deck.id} />
              </>
            )}
          </div>
        </div>

        {/* Main content */}
        <Card>
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {deck.url && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Lien externe</h3>
                <Button asChild variant="outline" size="sm">
                  <a href={deck.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Voir le deck
                  </a>
                </Button>
              </div>
            )}

            {deck.description && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
                <p className="text-sm whitespace-pre-wrap">{deck.description}</p>
              </div>
            )}

            {deck.decklist && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Liste de cartes</h3>
                <pre className="text-sm whitespace-pre-wrap font-mono bg-muted/50 p-4 rounded-md">{deck.decklist}</pre>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Créé le</h3>
                <p className="text-sm">{createdAt.toLocaleString(DateTime.DATETIME_MED)}</p>
                <p className="text-xs text-muted-foreground">{createdAt.toRelative()}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  Dernière modification
                </h3>
                <p className="text-sm">{updatedAt.toLocaleString(DateTime.DATETIME_MED)}</p>
                <p className="text-xs text-muted-foreground">{updatedAt.toRelative()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
