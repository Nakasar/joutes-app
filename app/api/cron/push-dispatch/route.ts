import { NextResponse } from "next/server";
import { drainPushJobs } from "@/lib/push/dispatch";
import { getNotificationById } from "@/lib/db/notifications";

/**
 * Dépilage des fan-outs mis en file.
 *
 * La plupart des notifications partent dans la foulée de l'action qui les crée.
 * Restent les annonces d'un lair très suivi, qui feraient sonner des milliers
 * de téléphones : celles-là sont mises en file, et ce passage les fait avancer
 * d'une page chacune.
 *
 * Le cron réclame plusieurs travaux plutôt que d'en vider un seul — une
 * annonce massive ne doit pas retarder indéfiniment celles qui suivent.
 *
 * `node:http2`, dont dépend l'envoi à Apple, n'existe pas hors du runtime Node,
 * que Cache Components impose désormais à toute l'application.
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { processed, failed } = await drainPushJobs(getNotificationById);
    return NextResponse.json({ ok: true, processed, failed });
  } catch (error) {
    console.error("[push] dépilage échoué", error);
    return NextResponse.json({ ok: false, error: "Dépilage impossible" }, { status: 500 });
  }
}
