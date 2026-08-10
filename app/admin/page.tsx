import Link from "next/link";

export default function AdminDashboard() {
  return (
    <div className="bg-muted/50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-foreground mb-8">
          Tableau de bord administrateur
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href="/admin/games"
            className="bg-card rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Gestion des Jeux
                </h2>
                <p className="text-muted-foreground">
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
            href="/admin/cards"
            className="bg-card rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Gestion des Cartes
                </h2>
                <p className="text-muted-foreground">
                  Ajouter une carte à un jeu avec ses attributs, son texte et son image
                </p>
              </div>
              <svg
                className="h-12 w-12 text-indigo-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-3-3v6m-7 5h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          </Link>

          <Link
            href="/admin/products"
            className="bg-card rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Gestion des Produits
                </h2>
                <p className="text-muted-foreground">
                  Boîtes, figurines et accessoires des jeux sans cartes, et ce que chaque boîte contient
                </p>
              </div>
              <svg
                className="h-12 w-12 text-teal-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
          </Link>

          <Link
            href="/admin/lairs"
            className="bg-card rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Gestion des Lieux
                </h2>
                <p className="text-muted-foreground">
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
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
          </Link>

          <Link
            href="/admin/achievements"
            className="bg-card rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Gestion des Succès
                </h2>
                <p className="text-muted-foreground">
                  Créer et modifier les succès et trophées
                </p>
              </div>
              <svg
                className="h-12 w-12 text-yellow-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
            </div>
          </Link>

          <Link
            href="/admin/exports"
            className="bg-card rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Exports de données
                </h2>
                <p className="text-muted-foreground">
                  Consulter, télécharger et supprimer les derniers exports de chaque jeu
                </p>
              </div>
              <svg
                className="h-12 w-12 text-purple-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </div>
          </Link>

          <Link
            href="/admin/reports"
            className="bg-card rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Contenus signalés
                </h2>
                <p className="text-muted-foreground">
                  Traiter les signalements des utilisateurs : ignorer ou supprimer le contenu
                </p>
              </div>
              <svg
                className="h-12 w-12 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
                />
              </svg>
            </div>
          </Link>
        </div>

        <div className="mt-8 bg-blue-500/10 border border-blue-500/30 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-2">
            Bienvenue dans l&apos;espace administrateur
          </h3>
          <p className="text-blue-800 dark:text-blue-300">
            Ici, vous pouvez gérer tous les aspects de la plateforme de joutes.
            Utilisez les liens ci-dessus pour accéder aux différentes sections.
          </p>
        </div>
      </div>
    </div>
  );
}
