import OAuthConsentComponent from "@/app/oauth/consent/ConsentComponent";
import {auth} from "@/lib/auth";
import {headers} from "next/headers";

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