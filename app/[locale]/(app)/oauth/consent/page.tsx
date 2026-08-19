import OAuthConsentComponent from "@/app/[locale]/(app)/oauth/consent/ConsentComponent.tsx";
import {auth} from "@/lib/auth.ts";
import {headers} from "next/headers";
import type { Metadata } from "next";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Autoriser l'application",
  robots: { index: false, follow: false },
};

export default async function OAuthConsentPage({ searchParams }: { searchParams: Promise<{ client_id?: string }> }) {
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