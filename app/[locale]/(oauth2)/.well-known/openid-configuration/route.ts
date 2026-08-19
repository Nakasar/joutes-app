import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth } from "../../../../../lib/auth.ts";

export const GET = oauthProviderOpenIdConfigMetadata(auth);
