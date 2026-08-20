import { Suspense } from "react";
import { AccountPanelSkeleton } from "@/components/AccountPanelSkeleton.tsx";
import OAuthConsentComponent from "@/app/[locale]/(app)/oauth/consent/ConsentComponent.tsx";
import {auth} from "@/lib/auth.ts";
import {headers} from "next/headers";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Autoriser l'application",
  robots: { index: false, follow: false },
};

async function OAuthConsentPageContent({ searchParams }: { searchParams: Promise<{ client_id?: string }> }) {
  const headersRes = await headers();
  const session = await auth.api.getSession({
    headers: headersRes,
  });
  const { client_id } = await searchParams;

  if (!client_id) {
    return <div>Invalid authorization request.</div>;
  }

  if (!session) {
    return <div>Loading...</div>;
  }

  const client = await auth.api.getOAuthClientPublic({
    query: {
      client_id: client_id,
    },
    headers: headersRes,
  });

  if (!client) {
    return <div>Invalid authorization request.</div>;
  }

  return (
    <OAuthConsentComponent client={client} />
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function OAuthConsentPage(props: Parameters<typeof OAuthConsentPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8">
          <AccountPanelSkeleton cards={2} label="Chargement de la demande d’autorisation" />
        </div>
      }
    >
      <OAuthConsentPageContent {...props} />
    </Suspense>
  );
}
