'use client';

import {authClient} from "@/lib/auth-client";
import {Button} from "@/components/ui/button";
import {OAuthClient} from "@better-auth/oauth-provider";

export default function OAuthConsentComponent({ client }: { client: OAuthClient }) {
  const session = authClient.useSession();

  if (!session?.data) {
    return <div>Loading...</div>;
  }

  async function consent() {
    const res = await authClient.oauth2.consent({
      accept: true,
    });

    if (res.error) {
      return;
    }

    if (res.data.redirect && res.data.uri) {
      console.log(res.data.uri);
      //window.location.href = res.data.uri;
    }
  }

  return (
    <div>
      <h1>Connect application</h1>
      <p>Welcome, {session.data.user?.name}</p>

      <p>The application <strong>{client.client_name}</strong> is requesting access to your account.</p>


      <Button onClick={consent}>Authorize application</Button>
    </div>
  );
}