import { NextResponse } from "next/server";
import db from "@/lib/mongodb";
import { clearProviderLink, getLinkedProviderUserIds } from "@/lib/db/subscriptions";
import { fetchCampaignMembers, nextCursor } from "@/lib/patreon/api";
import { patreonConfig } from "@/lib/patreon/config";
import { resolveMembership } from "@/lib/patreon/resolve";
import { applySnapshot, PATREON_PROVIDER_ID } from "@/lib/patreon/sync";

/**
 * La réconciliation quotidienne des abonnements.
 *
 * Le filet sous le webhook. Il rattrape une livraison perdue, une signature
 * refusée pendant une rotation de secret, un 504 de Patreon, et surtout les
 * environnements sans jeton créateur — où le webhook retombe sur l'état déduit
 * de la charge utile et redevient sensible à l'ordre d'arrivée. Une inversion y
 * est réparée sous vingt-quatre heures.
 *
 * Deux passes :
 *
 * 1. **Parcourir les membres de la campagne** et réécrire les projections de
 *    ceux qui ont lié leur compte.
 * 2. **Couper les liens morts** : un abonnement dont le compte Patreon n'existe
 *    plus dans `account`. C'est le rattrapage de la déliaison faite ailleurs que
 *    par notre propre action — sans lui, un droit survivrait à sa preuve.
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  // Contrôle de présence en plus de la comparaison : sans lui, un `CRON_SECRET`
  // non défini ferait comparer à la chaîne littérale « Bearer undefined », que
  // n'importe qui peut envoyer. Les sept crons plus anciens ont ce défaut ; on
  // ne le reproduit pas ici.
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || req.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = patreonConfig();

  if (!config?.campaignId || !config.creatorAccessToken) {
    // Aperçu, ou campagne pas encore configurée : il n'y a rien à réconcilier.
    return NextResponse.json({ ok: true, skipped: "patreon-non-configure" });
  }

  let scanned = 0;
  let updated = 0;
  let cursor: string | null = null;

  do {
    const page = await fetchCampaignMembers({
      campaignId: config.campaignId,
      creatorAccessToken: config.creatorAccessToken,
      cursor,
    });

    if (!page.ok) {
      // On s'arrête sans rien éteindre : une panne d'API ne doit jamais faire
      // conclure à une absence de palier. Le passage suivant reprendra.
      console.error("Réconciliation Patreon interrompue:", page.reason);
      return NextResponse.json(
        { ok: false, reason: page.reason, scanned, updated },
        { status: 200 }
      );
    }

    const members = Array.isArray(page.data.data) ? page.data.data : [];
    const included = page.data.included ?? [];

    for (const member of members) {
      scanned += 1;

      const snapshot = resolveMembership({ data: member, included });

      if (!snapshot?.patreonUserId) {
        continue;
      }

      const userId = await findLinkedUserId(snapshot.patreonUserId);

      if (!userId) {
        // Mécène qui n'a pas lié son compte Joutes : rien à projeter.
        continue;
      }

      await applySnapshot({ userId, snapshot, source: "cron" });
      updated += 1;
    }

    cursor = nextCursor(page.data);
  } while (cursor);

  const unlinked = await clearDeadLinks();

  return NextResponse.json({ ok: true, scanned, updated, unlinked });
}

async function findLinkedUserId(patreonUserId: string): Promise<string | null> {
  const account = await db
    .collection<{ userId: unknown }>("account")
    .findOne({ providerId: PATREON_PROVIDER_ID, accountId: patreonUserId });

  return account?.userId ? String(account.userId) : null;
}

/**
 * Éteint les abonnements dont le compte Patreon n'est plus lié.
 *
 * better-auth supprime la ligne `account` sans nous prévenir : sans ce passage,
 * un compte délié depuis un autre écran garderait ses droits indéfiniment.
 */
async function clearDeadLinks(): Promise<number> {
  const linked = await getLinkedProviderUserIds();

  if (linked.length === 0) {
    return 0;
  }

  const accounts = await db
    .collection<{ accountId: string }>("account")
    .find(
      { providerId: PATREON_PROVIDER_ID, accountId: { $in: linked.map((l) => l.providerUserId) } },
      { projection: { accountId: 1 } }
    )
    .toArray();

  const alive = new Set(accounts.map((account) => account.accountId));
  let cleared = 0;

  for (const { userId, providerUserId } of linked) {
    if (!alive.has(providerUserId)) {
      await clearProviderLink(userId);
      cleared += 1;
    }
  }

  return cleared;
}
