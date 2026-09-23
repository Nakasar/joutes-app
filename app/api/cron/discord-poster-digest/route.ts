import { NextResponse } from "next/server";
import { runPosterDigestBatch } from "@/lib/posters/digest-service";

/**
 * Les affiches de la semaine, en message privé Discord (Joutes Expert).
 *
 * Passe chaque heure du lundi et traite une tranche d'abonnés à chaque
 * fois : une affiche se dessine, et une invocation ne les dessinera pas toutes
 * d'un coup. Un abonné servi est marqué pour la semaine, si bien qu'un passage
 * de trop n'envoie rien deux fois.
 */
export async function GET(req: Request) {
  // Contrôle de présence en plus de la comparaison : sans lui, un `CRON_SECRET`
  // non défini ferait comparer à la chaîne littérale « Bearer undefined », que
  // n'importe qui peut envoyer.
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || req.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await runPosterDigestBatch()) });
  } catch (error) {
    console.error("Cron des affiches hebdomadaires en échec", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi des affiches" }, { status: 500 });
  }
}
