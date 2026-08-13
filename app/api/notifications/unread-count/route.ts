import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { countUnreadNotifications } from "@/lib/db/notifications";

/**
 * Le nombre de notifications non lues.
 *
 * L'app mobile pose son badge avec : les push, eux, n'en portent pas. Compter
 * les non-lues d'un destinataire demande l'agrégation complète des règles
 * d'accès, et la faire pour chaque appareil au moment du fan-out coûterait plus
 * que l'envoi lui-même. L'app demande donc le compte quand elle s'ouvre, une
 * fois, pour elle seule.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ count: await countUnreadNotifications(auth.userId) });
}
