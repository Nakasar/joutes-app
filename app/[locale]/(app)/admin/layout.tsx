import { requireAdmin } from "@/lib/middleware/admin.ts";
import { Link } from "@/i18n/navigation.ts";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

/**
 * La porte reste devant, et elle couvre toute l'administration.
 *
 * `requireAdmin()` lit la session : hors frontière, elle bloquait le prérendu de
 * la zone entière. Sous frontière, elle laisse une coquille — mais alors
 * `{children}` passe derrière elle, et les pages n'ajoutent rien à cette
 * coquille. C'est le prix assumé : personne ne doit voir l'ombre d'un écran
 * d'administration avant que la porte ait répondu, pas même sa mise en page.
 *
 * Ce qui reste devant est donc le fond et la silhouette de la barre d'onglets.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/50">
      <Suspense fallback={<AdminChromeSkeleton />}>
        <AdminChrome>{children}</AdminChrome>
      </Suspense>
    </div>
  );
}

/** La barre d'onglets, le temps que la porte réponde. */
function AdminChromeSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Vérification des droits d&apos;administration…</span>
      <div className="border-b border-border bg-card shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 animate-pulse items-center gap-8" aria-hidden>
            {[64, 40, 88, 64, 56, 64, 48].map((width, index) => (
              <div key={index} className="h-4 shrink-0 rounded bg-muted" style={{ width }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

async function AdminChrome({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  return (
    <>
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
    </>
  );
}
