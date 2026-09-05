import { NextResponse } from "next/server";

import { refreshGameSocialPosts } from "@/lib/social/game-social";

/**
 * Les publications des réseaux des éditeurs, deux fois par jour.
 *
 * Un cron à part de `game-lives`, qui tourne toutes les heures pour savoir si
 * un éditeur diffuse. Les deux lisent la même chaîne YouTube, mais ne cherchent
 * pas la même chose et n'ont pas la même urgence : un direct qui a commencé il y
 * a cinquante minutes n'intéresse plus personne, une publication de ce matin si.
 * Les fondre ferait sonder vingt-quatre fois par jour des comptes qui publient
 * deux fois par semaine.
 *
 * La séparation a un second effet : un quota YouTube épuisé par la récolte ne
 * peut pas éteindre les directs, et réciproquement.
 *
 * Rien ici ne jette : `refreshGameSocialPosts` traite chaque compte à part, et
 * l'échec de l'un n'empêche pas les autres.
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

  const report = await refreshGameSocialPosts();

  return NextResponse.json({ ok: true, ...report });
}
