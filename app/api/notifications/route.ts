import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { countUnreadNotifications, getUserNotifications } from "@/lib/db/notifications";
import { notificationsQuerySchema } from "@/lib/schemas/push-device.schema";
import { notificationLink } from "@/lib/notifications/deeplink";
import type { Notification } from "@/lib/types/Notification";

/**
 * Ce qu'une notification montre d'elle-même à son destinataire.
 *
 * Énuméré champ par champ, et non recopié depuis le document. `hiddenBy`
 * recense qui a masqué la notification : sur une annonce de lair, c'est la
 * liste des identifiants d'autres utilisateurs, et elle n'a rien à faire dans
 * une réponse. Une projection explicite ferme aussi la porte au prochain champ
 * interne qu'on ajoutera au modèle sans y penser.
 */
function toPublicNotification(notification: Notification, userId: string) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    description: notification.description,
    createdAt: notification.createdAt,
    link: notificationLink(notification),
    read: notification.readBy?.includes(userId) ?? false,
    template: notification.template ?? null,
    leagueId: notification.leagueId ?? null,
    matchId: notification.matchId ?? null,
    lair: notification.lair ? { id: notification.lair.id, name: notification.lair.name } : null,
    event: notification.event ? { id: notification.event.id, name: notification.event.name } : null,
  };
}

/**
 * Les notifications d'un utilisateur, pour un client qui n'est pas le site.
 *
 * Le site lit les siennes par des server actions, qui n'acceptent que le
 * cookie de session : l'app mobile n'avait donc aucun moyen de les consulter.
 * Cette route ouvre la même lecture à l'authentification de l'API — cookie ou
 * clé `jts_` — sans rien changer à ce que le site fait déjà.
 *
 * La destination de chaque notification est calculée ici plutôt que laissée au
 * client : la règle vit dans `lib/notifications/deeplink.ts`, et l'app mobile
 * n'a plus qu'à la traduire en route à elle.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = notificationsQuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!query.success) {
    return NextResponse.json({ error: "Paramètres de pagination invalides" }, { status: 400 });
  }

  try {
    const [{ notifications, total }, unreadCount] = await Promise.all([
      getUserNotifications(auth.userId, query.data),
      countUnreadNotifications(auth.userId),
    ]);

    return NextResponse.json({
      notifications: notifications.map((notification) => toPublicNotification(notification, auth.userId)),
      total,
      unreadCount,
      page: query.data.page,
      limit: query.data.limit,
    });
  } catch (error) {
    console.error("[notifications] lecture impossible", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
