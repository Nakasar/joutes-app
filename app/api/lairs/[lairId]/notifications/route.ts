import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { findVisibleLair } from "@/lib/api/lairs";
import {
  getLairNotificationPreference,
  setLairNotificationPreference,
} from "@/lib/db/lair-notification-prefs";
import { parseLairNotificationPreference } from "@/lib/lairs/notification-prefs";

type Params = Promise<{ lairId: string }>;

/**
 * Ce que l'appelant reçoit d'un lieu qu'il suit : `all`, `custom` (avec les
 * types cochés) ou `none`. Voir `lib/lairs/notification-prefs.ts`.
 *
 * Un lieu non suivi répond 409 : il n'y a rien à régler tant qu'on ne le suit
 * pas, et suivre un lieu le remet en `all`.
 */
async function resolve(request: NextRequest, params: Params) {
  const { lairId } = await params;
  const viewer = await authenticateApiRequest(request);
  if (!viewer) {
    return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }

  const lair = await findVisibleLair(lairId, viewer.userId);
  if (!lair) {
    return { error: NextResponse.json({ error: "Lieu introuvable" }, { status: 404 }) };
  }

  return { lairId, userId: viewer.userId };
}

const NOT_FOLLOWING = () =>
  NextResponse.json({ error: "Suivez ce lieu pour régler ses notifications" }, { status: 409 });

export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const context = await resolve(request, params);
    if ("error" in context) return context.error;

    const preference = await getLairNotificationPreference(context.userId, context.lairId);
    return preference ? NextResponse.json(preference) : NOT_FOLLOWING();
  } catch (error) {
    console.error("Error reading lair notification preference:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Params }) {
  try {
    const context = await resolve(request, params);
    if ("error" in context) return context.error;

    const preference = parseLairNotificationPreference(await request.json().catch(() => null));
    if (!preference) {
      return NextResponse.json(
        { error: "Niveau attendu : all, custom (avec categories) ou none" },
        { status: 400 }
      );
    }

    const saved = await setLairNotificationPreference(context.userId, context.lairId, preference);
    return saved ? NextResponse.json(preference) : NOT_FOLLOWING();
  } catch (error) {
    console.error("Error updating lair notification preference:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
