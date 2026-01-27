'use client';

import {authClient} from "@/lib/auth-client";
import {Button} from "@/components/ui/button";

export default function OAuthConsentPage() {
  const session = authClient.useSession();

  if (!session?.data) {
    return <div>Loading...</div>;
  }

  async function consent() {
    await authClient.oauth2.consent({
      accept: true,
    });
  }

  return (
    <div>
      <h1>Connect application</h1>
      <p>Welcome, {session.data.user?.name}</p>

      <Button onClick={consent}>Authorize application</Button>
    </div>
  );
}