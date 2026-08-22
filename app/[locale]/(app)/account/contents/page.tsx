import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { AccountPanelSkeleton } from "@/components/AccountPanelSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { listContentsByAuthor } from "@/lib/db/user-contents.ts";

import ContentsClient from "./ContentsClient.tsx";

export const metadata: Metadata = {
  title: "Mes publications",
  robots: { index: false, follow: false },
};

/**
 * Les publications d'un joueur.
 *
 * Une route sœur plutôt qu'un onglet : l'écran a sa propre liste et son propre
 * formulaire, et la barre d'onglets du compte est déjà à six entrées. On y
 * arrive depuis « Ma vitrine » et depuis l'onglet Profil.
 *
 * Tout cet écran est derrière la porte, titre compris : on ne montre pas la
 * mise en page d'un espace personnel avant de savoir à qui il appartient.
 */
async function ContentsPageContent() {
  const [session, locale] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getLocale(),
  ]);

  if (!session?.user) {
    redirect("/login");
  }

  const contents = await listContentsByAuthor(session.user.id);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto max-w-5xl px-4">
        <ContentsClient contents={contents} locale={locale} />
      </div>
    </div>
  );
}

export default function ContentsPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8">
          <AccountPanelSkeleton cards={2} label="Chargement de vos publications" />
        </div>
      }
    >
      <ContentsPageContent />
    </Suspense>
  );
}
