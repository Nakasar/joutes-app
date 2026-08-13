import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { markNotificationAsRead } from "@/lib/db/notifications";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { notificationId } = await params;

  try {
    // Marquer comme lu n'écrit que son propre identifiant dans `readBy` : rien
    // de ce qu'un autre voit n'en dépend, d'où l'absence de contrôle sur le
    // droit de voir la notification — c'est déjà ce que fait le site.
    await markNotificationAsRead(notificationId, auth.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[notifications] marquage impossible", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
