import { NextResponse } from "next/server";
import { claimEvent, completeEvent, payloadHash } from "@/lib/db/subscription-events";
import { patreonWebhookSecret } from "@/lib/patreon/config";
import { resolveMembership } from "@/lib/patreon/resolve";
import { applySnapshot, findUserIdByPatreonId, syncMemberFromCreatorToken } from "@/lib/patreon/sync";
import {
  PATREON_EVENT_HEADER,
  PATREON_SIGNATURE_HEADER,
  verifyPatreonSignature,
} from "@/lib/patreon/webhook";

/**
 * Le webhook Patreon.
 *
 * Trois choses le gouvernent, dans cet ordre.
 *
 * **Le corps est lu brut.** `await req.text()`, jamais `req.json()` : la
 * signature porte sur les octets reçus. Le webhook Discord de ce dépôt vérifie
 * un corps re-sérialisé, ce qui ne marche que par chance ; un test de
 * non-régression tient la différence.
 *
 * **La charge utile ne fait pas foi.** Elle dit *qui* a changé ; c'est l'API qui
 * dit *ce qu'il est devenu*. On relit donc le membre à la source avant d'écrire.
 * L'ordre de livraison et les répétitions deviennent alors sans effet — deux
 * webhooks dans le désordre convergent vers le même état. Sans jeton créateur,
 * on retombe sur l'état déduit de la charge utile, et c'est le cron quotidien
 * qui répare une éventuelle inversion.
 *
 * **On répond 200 dès que la livraison est authentique.** Patreon réémet sur
 * erreur ; répondre 500 parce qu'un compte n'est pas lié chez nous ferait boucler
 * une livraison que personne ne saura jamais traiter. Seules la signature
 * invalide (401) et l'absence de secret (503) sortent en erreur.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = patreonWebhookSecret();

  if (!secret) {
    // Déploiement d'aperçu, ou production pas encore configurée. On refuse
    // franchement plutôt que d'accepter sans vérifier.
    return NextResponse.json({ error: "Patreon non configuré" }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get(PATREON_SIGNATURE_HEADER);
  const trigger = req.headers.get(PATREON_EVENT_HEADER) ?? "unknown";

  if (!verifyPatreonSignature(rawBody, signature, secret)) {
    console.warn("Signature de webhook Patreon invalide");
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  const hash = payloadHash(trigger, rawBody);

  // Réservation avant traitement : deux livraisons simultanées ne se croisent
  // pas, la seconde heurte l'index unique et s'arrête ici.
  let claimed: boolean;
  try {
    claimed = await claimEvent({ trigger, hash, source: "webhook" });
  } catch (error) {
    console.error("Journal d'abonnement indisponible:", error);
    // Le journal est informatif : son indisponibilité ne doit pas empêcher de
    // traiter le signal. On perd l'idempotence pour cette livraison, ce qui est
    // sans conséquence puisque la synchronisation est elle-même idempotente.
    claimed = true;
  }

  if (!claimed) {
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  try {
    const snapshot = resolveMembership(JSON.parse(rawBody));

    if (!snapshot?.patreonUserId) {
      await completeEvent({ hash, applied: false, error: "payload-sans-utilisateur" });
      return NextResponse.json({ ok: true, ignored: "payload-sans-utilisateur" });
    }

    const userId = await findUserIdByPatreonId(snapshot.patreonUserId);

    if (!userId) {
      // Ce mécène n'a pas lié son Patreon à un compte Joutes. C'est courant et
      // parfaitement normal : il n'y a rien à faire, et rien à réessayer.
      await completeEvent({
        hash,
        providerUserId: snapshot.patreonUserId,
        providerMemberId: snapshot.memberId,
        applied: false,
        error: "compte-non-lie",
      });
      return NextResponse.json({ ok: true, ignored: "compte-non-lie" });
    }

    // On relit la vérité à la source quand on le peut ; sinon on applique ce que
    // la charge utile décrit.
    const outcome = snapshot.memberId
      ? await syncMemberFromCreatorToken(userId, snapshot.memberId, "webhook")
      : { ok: false as const, reason: "no-member-id" };

    if (outcome.ok) {
      await completeEvent({
        hash,
        providerUserId: snapshot.patreonUserId,
        providerMemberId: snapshot.memberId,
        plansBefore: outcome.plansBefore,
        plansAfter: outcome.plansAfter,
        applied: true,
      });
      return NextResponse.json({ ok: true, plans: outcome.plansAfter });
    }

    const fallback = await applySnapshot({ userId, snapshot, source: "webhook" });

    await completeEvent({
      hash,
      providerUserId: snapshot.patreonUserId,
      providerMemberId: snapshot.memberId,
      plansBefore: fallback.plansBefore,
      plansAfter: fallback.plansAfter,
      applied: true,
      error: `repli-charge-utile:${outcome.reason}`,
    });

    return NextResponse.json({ ok: true, plans: fallback.plansAfter, fallback: outcome.reason });
  } catch (error) {
    console.error("Erreur de traitement du webhook Patreon:", error);
    await completeEvent({ hash, applied: false, error: String(error) });

    // 500 : Patreon réessaiera, et l'erreur est de notre côté.
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
