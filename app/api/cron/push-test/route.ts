import { NextResponse } from "next/server";
import { isPushEnabled, pushConfig } from "@/lib/push/config";
import { sendApns } from "@/lib/push/apns";
import { sendFcm } from "@/lib/push/fcm";
import { buildApnsPayload, buildFcmMessage } from "@/lib/push/payload";

/**
 * Envoi d'essai vers un jeton donné.
 *
 * Le premier envoi réel est le moment où l'on découvre qu'une clé est mal
 * copiée, qu'un identifiant d'application ne correspond pas, ou qu'un jeton
 * vient d'un build de développement. Le découvrir à travers le fan-out complet
 * — création d'une notification, résolution de l'audience, dépilage — rend le
 * diagnostic pénible. Cette route court-circuite tout : un jeton, un message,
 * la réponse brute du fournisseur.
 *
 * Elle est rangée sous `cron/` pour hériter de son authentification, pas parce
 * qu'elle est planifiée : elle n'est appelée qu'à la main.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://joutes.app/api/cron/push-test?platform=ios&token=..."
 *
 * `node:http2` n'existe pas hors du runtime Node : la déclaration ci-dessous
 * n'est pas décorative.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const platform = url.searchParams.get("platform");
  const environment = url.searchParams.get("environment") === "sandbox" ? "sandbox" : "production";

  if (!token || (platform !== "ios" && platform !== "android")) {
    return NextResponse.json(
      { error: "Paramètres attendus : token, platform (ios|android), environment (production|sandbox)" },
      { status: 400 }
    );
  }

  const config = pushConfig();
  const content = {
    title: "Joutes",
    body: "Essai d'envoi. Si vous lisez ceci, les notifications fonctionnent.",
    link: "/notifications",
    notificationId: "test",
  };

  try {
    const results =
      platform === "ios"
        ? config.apns
          ? await sendApns(config.apns, [{ token, environment }], buildApnsPayload(content))
          : null
        : config.fcm
          ? await sendFcm(config.fcm, [token], buildFcmMessage(content))
          : null;

    if (!results) {
      return NextResponse.json(
        { error: `Fournisseur non configuré pour ${platform}` },
        { status: 503 }
      );
    }

    // On rend le verdict brut, y compris `PUSH_ENABLED` : c'est justement une
    // route de diagnostic, et savoir que l'arrêt d'urgence est tiré fait partie
    // du diagnostic.
    return NextResponse.json({ pushEnabled: isPushEnabled(), results });
  } catch (error) {
    console.error("[push] essai d'envoi échoué", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
