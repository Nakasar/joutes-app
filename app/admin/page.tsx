import Link from "next/link";

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Tableau de bord administrateur
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href="/admin/games"
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Gestion des Jeux
                </h2>
                <p className="text-gray-600">
                  Voir et gérer les jeux supportés sur la plateforme
                </p>
              </div>
              <svg
                className="h-12 w-12 text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
          </Link>

          <Link
            href="/admin/lairs"
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Gestion des Lieux
                </h2>
                <p className="text-gray-600">
                  Voir et gérer les lieux de jeu sur la plateforme
                </p>
              </div>
              <svg
                className="h-12 w-12 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
          </Link>
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            Bienvenue dans l&apos;espace administrateur
          </h3>
          <p className="text-blue-800">
            Ici, vous pouvez gérer tous les aspects de la plateforme de joutes.
            Utilisez les liens ci-dessus pour accéder aux différentes sections.
          </p>
        </div>
      </div>
    </div>
  );
}
