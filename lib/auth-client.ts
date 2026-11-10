import { createAuthClient } from "better-auth/react";
import { customSessionClient, emailOTPClient } from "better-auth/client/plugins";
import {passkeyClient} from "@better-auth/passkey/client";
import {oauthProviderClient} from "@better-auth/oauth-provider/client";
import type { auth } from "@/lib/auth";

export const authClient = createAuthClient({
  // Depuis better-auth 1.7, Patreon (greffon `genericOAuth` côté serveur) est
  // un fournisseur social comme les autres : sa liaison passe par
  // `authClient.linkSocial({ provider: "patreon" })`, sans greffon client.
  //
  // `customSessionClient` ne fait rien à l'exécution : il ne sert qu'à donner
  // au client le type que le serveur rend — `session.user.badges`, que
  // `customSession` (dans `lib/auth.ts`) ajoute. C'est un `import type` sur
  // `auth` : le module serveur n'entre pas dans le paquet client.
  plugins: [
    emailOTPClient(),
    passkeyClient(),
    oauthProviderClient(),
    customSessionClient<typeof auth>(),
  ],
});

export const { signIn, signOut, useSession } = authClient;
