import { getAllLairs } from "@/lib/db/lairs";
import Link from "next/link";
import Image from "next/image";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: 'Lieux de jeu',
  description: 'Découvrez tous les lieux de jeu et leurs événements à venir',
};

export default async function LairsPage() {
  const lairs = await getAllLairs();

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Lieux de jeu</h1>
      
      {lairs.length === 0 ? (
        <p className="text-gray-500">Aucun lieu de jeu disponible pour le moment.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lairs.map((lair) => (
            <Link 
              key={lair.id} 
              href={`/lairs/${lair.id}`}
              className="group"
            >
              <div className="border rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 bg-white">
                {lair.banner ? (
                  <div className="relative w-full h-48">
                    <Image
                      src={lair.banner}
                      alt={lair.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ) : (
                  <div className="w-full h-48 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <span className="text-white text-6xl">🎲</span>
                  </div>
                )}
                
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-2 group-hover:text-blue-600 transition-colors">
                    {lair.name}
                  </h2>
                  
                  {lair.games.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-600 mb-2">
                        {lair.games.length} jeu{lair.games.length > 1 ? 'x' : ''} disponible{lair.games.length > 1 ? 's' : ''}
                      </p>
                    </div>
                  )}
                  
                  <div className="mt-4 flex items-center text-blue-600 font-medium">
                    Voir les détails
                    <svg 
                      className="w-4 h-4 ml-2 group-hover:translate-x-2 transition-transform" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
