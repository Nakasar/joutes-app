import { BoosterCard } from "@/lib/types/booster";
import ReactMarkdown from "react-markdown";
import CardSearchBar from "./CardSearchBar";
import CollectionManager from "./CollectionManager";
import db from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Metadata } from "next/types";
import { getErratasByCardId } from "@/lib/db/erratas";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cardId: string }>;
}): Promise<Metadata> {
  const { cardId } = await params;

  // Récupérer les informations de la carte depuis MongoDB
  const card = await db.collection<BoosterCard>("cards").findOne({ id: cardId });

  if (!card) {
    return {
      title: 'Carte non trouvée',
    };
  }

  const erratas = await getErratasByCardId(cardId);

  return {
    title: `${card.name} - Details, official erratas and community rulings`,
    description: `Discover details of ${card.name}, including official erratas and community rulings.\n\nThis card has ${erratas.length} errata and clarifications contributed by the community.${card.banned ? "\n\nThis card is currently banned." : ""}${erratas.length === 1 ? `\n\n${erratas[0].type} (${erratas[0].errataDate}):\n${erratas[0].details}` : ''}`,
    openGraph: {
      title: `${card.name} - Details, official erratas and community rulings`,
      description: `Discover details of ${card.name}, including official erratas and community rulings.\n\nThis card has ${erratas.length} errata and clarifications contributed by the community.${card.banned ? "\n\nThis card is currently banned." : ""}${erratas.length === 1 ? `\n\n${erratas[0].type} (${erratas[0].errataDate}):\n${erratas[0].details}` : ''}`,
      images: [card.image],
    },
  };
}

export default async function RiftboundCardDetailPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;

  // Récupérer les informations de la carte depuis MongoDB
  const card = await db.collection<BoosterCard>("cards").findOne({ id: cardId });

  if (!card) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Carte non trouvée</h1>
        <Button asChild>
          <Link href={`/games/${"riftbound"}/cards`} className="text-blue-600 hover:underline">
            ← Retour à la liste des cartes
          </Link>
        </Button>

        <p>La carte avec l'ID {cardId} n'existe pas.</p>
      </div>
    );
  }

  // Récupérer les erratas pour cette carte (avec votes)
  const erratas = await getErratasByCardId(cardId, userId);

  return (
    <div className="container mx-auto p-6">
      <Button asChild>
        <Link href={`/games/${"riftbound"}/cards`} className="text-blue-600 hover:underline">
          ← Retour à la liste des cartes
        </Link>
      </Button>

      {/* Barre de recherche */}
      <div className="mb-8 flex justify-center">
        <CardSearchBar />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Image de la carte */}
        <div>
          <img
            src={card.image}
            alt={card.name}
            className="w-full rounded-lg shadow-lg"
          />
        </div>

        {/* Détails de la carte */}
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h1 className="text-3xl font-bold">{card.name}</h1>
            {card.banned && (
              <span className="bg-red-600 text-white text-sm font-semibold px-2 py-1 rounded">
                Banned
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mb-6">
            <p className="text-muted-foreground">
              {card.setCode} #{card.collectorNumber}
            </p>
          </div>

          {userId && (
            <div className="mb-6">
              <CollectionManager
                cardId={card.id}
                gameSlug="riftbound"
                cardName={card.name}
                setCode={card.setCode}
                collectorNumber={card.collectorNumber}
                image={card.image}
              />
            </div>
          )}

          {/* Section Erratas/Clarifications/Rulings */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold">
                Erratas & Clarifications
              </h2>
            </div>

            {erratas.length === 0 ? (
              <p className="text-muted-foreground">
                Aucun errata ou clarification pour cette carte.
              </p>
            ) : (
              <div className="space-y-4">
                {erratas.map((errata) => (
                  <div
                    key={errata.id}
                    className={`border rounded-lg p-4 bg-card ${errata.deprecatedAt ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ${
                            errata.type === "errata"
                              ? "bg-red-100 text-red-800"
                              : errata.type === "clarification"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          {errata.type === "errata"
                            ? "Errata"
                            : errata.type === "clarification"
                            ? "Clarification"
                            : "Ruling"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(errata.errataDate).toLocaleDateString("fr-FR", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                    {errata.deprecatedAt && (
                      <span className="inline-block mb-2 text-xs font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        Déprécié
                      </span>
                    )}
                    <div className="prose prose-sm dark:prose-invert max-w-none ">
                      <ReactMarkdown children={errata.details} />
                    </div>
                    {errata.source && (
                      <div className="mt-2 pt-2 border-t">
                        <a
                          href={errata.source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Source →
                        </a>
                      </div>
                    )}
                    {errata.deprecatedAt && (
                      <div className="mt-2 pt-2 border-t">
                        <span className="text-xs text-muted-foreground italic">
                          Déprécié le{" "}
                          {new Date(errata.deprecatedAt).toLocaleDateString("fr-FR", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t">
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
