import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Origines autorisées à lire les réponses de l'API depuis un autre site. Toute
// origine absente de cette liste ne reçoit aucun en-tête CORS. Les deux entrées
// `tauri.localhost` correspondent à l'application de bureau, déjà déclarée dans
// les `trustedOrigins` de `lib/auth.ts`.
const allowedOrigins = [
  "https://tools.joutes.app",
  "https://beta.joutes.app",
  "http://localhost:5173",
  "http://tauri.localhost",
  "https://tauri.localhost",
];

// This function can be marked `async` if using `await` inside
export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const res = NextResponse.next();

  // La réponse dépend de l'origine : sans `Vary`, un cache partagé pourrait
  // servir à une origine l'autorisation accordée à une autre.
  res.headers.append("Vary", "Origin");

  // Seules les origines de la liste reçoivent une autorisation, et elle est la
  // seule à porter `Allow-Credentials`. Renvoyer l'origine appelante quelle
  // qu'elle soit revenait à autoriser n'importe quel site à lire les réponses
  // authentifiées de toute l'API.
  if (origin && allowedOrigins.includes(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  return res;
}

export const config = {
  matcher: '/api/:path*',
};
