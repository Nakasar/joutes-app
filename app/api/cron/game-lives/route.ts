import { NextResponse } from "next/server";

import { refreshGameLives } from "@/lib/streams/game-lives";

/**
 * Les directs des éditeurs, toutes les heures.
 *
 * Un cron à part de `streams-refresh`, qui tourne toutes les cinq minutes pour
 * les chaînes liées à un compte. Les deux ne suivent ni les mêmes chaînes ni le
 * même rythme, et les fondre ferait payer douze fois par heure un sondage dont
 * personne n'attend cette fraîcheur : un direct d'éditeur est annoncé des jours
 * à l'avance, et le voir apparaître dans l'heure est le contrat.
 *
 * La séparation a un second effet, plus utile encore : un quota YouTube épuisé
 * par ce sondage ne peut pas éteindre les directs des membres, et
 * réciproquement.
 *
 * Rien ici ne jette : `refreshGameLives` traite chaque chaîne à part, et
 * l'échec de l'une n'empêche pas les autres.
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  // Contrôle de présence en plus de la comparaison : sans lui, un `CRON_SECRET`
  // non défini ferait comparer à la chaîne littérale « Bearer undefined », que
  // n'importe qui peut envoyer.
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || req.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await refreshGameLives();

  return NextResponse.json({ ok: true, ...report });
}
