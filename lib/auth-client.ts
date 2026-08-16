import { createAuthClient } from "better-auth/react";
import { emailOTPClient, genericOAuthClient } from "better-auth/client/plugins";
import {passkeyClient} from "@better-auth/passkey/client";
import {oauthProviderClient} from "@better-auth/oauth-provider/client";

export const authClient = createAuthClient({
  // `genericOAuthClient` fait exister `authClient.oauth2.link({ providerId })`,
  // par où passe la liaison d'un compte Patreon. Il est monté même quand
  // Patreon n'est pas configuré : ce qui varie côté serveur est la liste des
  // fournisseurs, pas la présence du plugin, sinon le type inféré ici changerait
  // d'un environnement à l'autre.
  plugins: [emailOTPClient(), passkeyClient(), oauthProviderClient(), genericOAuthClient()],
});

export const { signIn, signOut, useSession } = authClient;
