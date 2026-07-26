import 'server-only';
import { notifyUser } from "@/lib/services/notifications";
import { getUserById } from "@/lib/db/users";
import type { Trade } from "@/lib/db/trades";

export type TradeNotificationKind =
  | "invited"
  | "joined"
  | "left"
  | "removed"
  | "validated"
  | "completed"
  | "cancelled";

function messageFor(kind: TradeNotificationKind, actorName: string): { title: string; description: string } {
  switch (kind) {
    case "invited":
      return {
        title: "Invitation à un échange",
        description: `${actorName} vous propose un échange de cartes.`,
      };
    case "joined":
      return {
        title: "Partenaire d'échange",
        description: `${actorName} a rejoint votre échange.`,
      };
    case "left":
      return {
        title: "Échange quitté",
        description: `${actorName} a quitté votre échange.`,
      };
    case "removed":
      return {
        title: "Échange quitté",
        description: `${actorName} vous a retiré de son échange.`,
      };
    case "validated":
      return {
        title: "Échange validé",
        description: `${actorName} a validé son offre : validez la vôtre pour finaliser l'échange.`,
      };
    case "completed":
      return {
        title: "Échange effectué",
        description: `Votre échange avec ${actorName} a été appliqué à votre collection.`,
      };
    case "cancelled":
      return {
        title: "Échange annulé",
        description: `${actorName} a annulé votre échange.`,
      };
  }
}

/**
 * Prévient l'autre participant d'un échange. Best-effort : une notification qui
 * échoue ne doit pas faire échouer l'action demandée par l'utilisateur.
 */
export async function notifyTradeCounterpart(
  trade: Trade,
  actorUserId: string,
  kind: TradeNotificationKind,
  { recipientUserId }: { recipientUserId?: string } = {}
): Promise<void> {
  try {
    const recipient =
      recipientUserId ??
      trade.sides.find((side) => side.user && side.user.id !== actorUserId)?.user?.id;

    if (!recipient || recipient === actorUserId) return;

    const actor = await getUserById(actorUserId);
    const actorName = actor?.displayName || actor?.username || "Un joueur";
    const { title, description } = messageFor(kind, actorName);

    await notifyUser(recipient, title, description);
  } catch (error) {
    console.error("Failed to notify trade counterpart:", error);
  }
}
