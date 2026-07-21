import 'server-only';

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { validateApiKey } from "@/lib/db/api-keys";

/**
 * Résout l'utilisateur d'une requête API : session better-auth (cookie) ou
 * clé API `jts_...` passée en `Authorization: Bearer`.
 */
export async function authenticateApiRequest(request: Request): Promise<{ userId: string } | null> {
  const authorization = request.headers.get("authorization") ?? undefined;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : authorization;

  if (token?.startsWith("jts_")) {
    const key = await validateApiKey(token);
    if (key) {
      return { userId: key.userId };
    }
    return null;
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) {
    return { userId: session.user.id };
  }

  return null;
}
