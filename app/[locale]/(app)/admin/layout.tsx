import { requireAdmin } from "@/lib/middleware/admin.ts";
import { Link } from "@/i18n/navigation.ts";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  return (
    <div className="bg-muted/50">
      {/* Deuxième repère « navigation » de la page, après celui de l'en-tête du
          site : sans nom, un lecteur d'écran les annonce tous deux « navigation »
          et ne donne aucun moyen de les distinguer. */}
      <nav aria-label="Administration" className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between gap-4 h-16">
            {/*
              Les onglets défilent dans leur propre boîte dès qu'ils ne
              tiennent plus sur la ligne. Sans elle, la barre poussait la page
              entière au-delà de l'écran d'un téléphone : ce n'était pas le menu
              seul qui débordait, mais toute l'administration qui se retrouvait
              décalée, tableaux compris, avec une bande vide sur la droite.

              `min-w-0` est ce qui rend le défilement possible : un enfant de
              flexbox refuse par défaut de devenir plus étroit que son contenu,
              et la boîte à défilement n'aurait jamais eu de raison de défiler.
            */}
            <div className="flex space-x-8 min-w-0 overflow-x-auto">
              <Link
                href="/admin"
                className="inline-flex items-center shrink-0 whitespace-nowrap px-1 pt-1 text-sm font-medium text-foreground border-b-2 border-transparent hover:border-blue-500"
              >
                Tableau de bord
              </Link>
              <Link
                href="/admin/games"
                className="inline-flex items-center shrink-0 whitespace-nowrap px-1 pt-1 text-sm font-medium text-foreground border-b-2 border-transparent hover:border-blue-500"
              >
                Jeux
              </Link>
              <Link
                href="/admin/users"
                className="inline-flex items-center shrink-0 whitespace-nowrap px-1 pt-1 text-sm font-medium text-foreground border-b-2 border-transparent hover:border-blue-500"
              >
                Utilisateurs
              </Link>
              <Link
                href="/admin/tournaments"
                className="inline-flex items-center shrink-0 whitespace-nowrap px-1 pt-1 text-sm font-medium text-foreground border-b-2 border-transparent hover:border-blue-500"
              >
                Tournois
              </Link>
              <Link
                href="/admin/cards"
                className="inline-flex items-center shrink-0 whitespace-nowrap px-1 pt-1 text-sm font-medium text-foreground border-b-2 border-transparent hover:border-blue-500"
              >
                Cartes
              </Link>
              <Link
                href="/admin/products"
                className="inline-flex items-center shrink-0 whitespace-nowrap px-1 pt-1 text-sm font-medium text-foreground border-b-2 border-transparent hover:border-blue-500"
              >
                Produits
              </Link>
              <Link
                href="/admin/lairs"
                className="inline-flex items-center shrink-0 whitespace-nowrap px-1 pt-1 text-sm font-medium text-foreground border-b-2 border-transparent hover:border-blue-500"
              >
                Lieux
              </Link>
              <Link
                href="/admin/achievements"
                className="inline-flex items-center shrink-0 whitespace-nowrap px-1 pt-1 text-sm font-medium text-foreground border-b-2 border-transparent hover:border-blue-500"
              >
                Succès
              </Link>
              <Link
                href="/admin/exports"
                className="inline-flex items-center shrink-0 whitespace-nowrap px-1 pt-1 text-sm font-medium text-foreground border-b-2 border-transparent hover:border-blue-500"
              >
                Exports
              </Link>
              <Link
                href="/admin/reports"
                className="inline-flex items-center shrink-0 whitespace-nowrap px-1 pt-1 text-sm font-medium text-foreground border-b-2 border-transparent hover:border-blue-500"
              >
                Signalements
              </Link>
            </div>
            {/* Repère de contexte, pas une commande : sur un écran étroit il
                se contentait de manger la place des onglets, en se coupant sur
                deux lignes. */}
            <div className="hidden sm:flex items-center shrink-0">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Espace Admin</span>
            </div>
          </div>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}
