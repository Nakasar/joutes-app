import { getLairById } from "@/lib/db/lairs";
import { getEventsByLairId } from "@/lib/db/events";
import { getGameById } from "@/lib/db/games";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Metadata } from "next";

export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ lairId: string }> 
}): Promise<Metadata> {
  const { lairId } = await params;
  const lair = await getLairById(lairId);

  if (!lair) {
    return {
      title: 'Lieu non trouvé',
    };
  }

  return {
    title: `${lair.name} - Lieu de jeu`,
    description: `Découvrez ${lair.name} et ses événements à venir. ${lair.games.length} jeu(x) disponible(s).`,
    openGraph: {
      title: lair.name,
      description: `Découvrez ${lair.name} et ses événements à venir`,
      images: lair.banner ? [lair.banner] : [],
    },
  };
}

export default async function LairDetailPage({ 
  params 
}: { 
  params: Promise<{ lairId: string }> 
}) {
  const { lairId } = await params;
  const lair = await getLairById(lairId);

  if (!lair) {
    notFound();
  }

  const upcomingEvents = await getEventsByLairId(lairId);
  
  // Récupérer les détails des jeux
  const gamesDetails = await Promise.all(
    lair.games.map(async (gameId) => {
      const game = await getGameById(gameId);
      return game;
    })
  );
  const games = gamesDetails.filter((game): game is NonNullable<typeof game> => game !== null);

  // Formater la date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // Badge de statut
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available':
        return <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">Disponible</span>;
      case 'sold-out':
        return <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">Complet</span>;
      case 'cancelled':
        return <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">Annulé</span>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Bannière */}
      <div className="relative w-full h-64 md:h-96 bg-gradient-to-br from-blue-500 to-purple-600">
        {lair.banner ? (
          <Image
            src={lair.banner}
            alt={lair.name}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-white text-9xl">🎲</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black bg-opacity-40 flex items-end">
          <div className="container mx-auto px-4 py-8">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-2">
              {lair.name}
            </h1>
            <Link 
              href="/lairs"
              className="text-white hover:text-gray-200 flex items-center gap-2 mt-4"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Retour à la liste des lieux
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Section Jeux disponibles */}
        {games.length > 0 && (
          <section className="mb-12 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-3xl font-bold mb-6">Jeux disponibles</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {games.map((game) => (
                <div key={game.id} className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
                  <div className="flex items-center gap-3">
                    {game.icon && (
                      <div className="relative w-12 h-12 flex-shrink-0">
                        <Image
                          src={game.icon}
                          alt={game.name}
                          fill
                          className="object-contain"
                        />
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-lg">{game.name}</h3>
                      <p className="text-sm text-gray-600">{game.type}</p>
                    </div>
                  </div>
                  {game.description && (
                    <p className="mt-3 text-sm text-gray-700 line-clamp-2">
                      {game.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section Événements à venir */}
        <section className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-3xl font-bold mb-6">Événements à venir</h2>
          
          {upcomingEvents.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500 text-lg">Aucun événement à venir pour le moment</p>
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingEvents.map((event) => (
                <div 
                  key={event.id} 
                  className="border rounded-lg p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold">{event.name}</h3>
                        {getStatusBadge(event.status)}
                      </div>
                      
                      <div className="space-y-2 text-gray-600">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="capitalize">{formatDate(event.startDateTime)}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Fin : {formatDate(event.endDateTime)}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                          </svg>
                          <span className="font-medium">{event.gameName}</span>
                        </div>
                      </div>
                    </div>
                    
                    {event.price !== undefined && (
                      <div className="text-right">
                        <div className="text-3xl font-bold text-blue-600">
                          {event.price === 0 ? 'Gratuit' : `${event.price}€`}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
