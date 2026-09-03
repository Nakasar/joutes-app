import { createAuthClient } from "better-auth/react";
import { customSessionClient, emailOTPClient, genericOAuthClient } from "better-auth/client/plugins";
import {passkeyClient} from "@better-auth/passkey/client";
import {oauthProviderClient} from "@better-auth/oauth-provider/client";
import type { auth } from "@/lib/auth";

export const authClient = createAuthClient({
  // `genericOAuthClient` fait exister `authClient.oauth2.link({ providerId })`,
  // par où passe la liaison d'un compte Patreon. Il est monté même quand
  // Patreon n'est pas configuré : ce qui varie côté serveur est la liste des
  // fournisseurs, pas la présence du plugin, sinon le type inféré ici changerait
  // d'un environnement à l'autre.
  //
  // `customSessionClient` ne fait rien à l'exécution : il ne sert qu'à donner
  // au client le type que le serveur rend — `session.user.badges`, que
  // `customSession` (dans `lib/auth.ts`) ajoute. C'est un `import type` sur
  // `auth` : le module serveur n'entre pas dans le paquet client.
  plugins: [
    emailOTPClient(),
    passkeyClient(),
    oauthProviderClient(),
    genericOAuthClient(),
    customSessionClient<typeof auth>(),
  ],
});

export const { signIn, signOut, useSession } = authClient;
