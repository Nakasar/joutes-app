import 'server-only';

import { isPushEnabled, pushConfig } from "@/lib/push/config";
import { sendApns, type PushSendResult } from "@/lib/push/apns";
import { sendFcm } from "@/lib/push/fcm";
import { buildApnsPayload, buildFcmMessage, type PushContent } from "@/lib/push/payload";
import {
  deletePushDevicesByTokens,
  listActiveDevicesForUsers,
  recordPushFailure,
  setPushDeviceEnvironment,
} from "@/lib/db/push-devices";
import type { PushDevice } from "@/lib/types/PushDevice";

/**
 * L'envoi, vu de haut : des destinataires, un contenu, et le ménage qui suit.
 *
 * Ce module est le seul à savoir que Joutes parle à deux fournisseurs. Ce qui
 * l'appelle ne connaît que des identifiants d'utilisateurs et un message.
 *
 * Le ménage compte autant que l'envoi. Un jeton dont le fournisseur dit qu'il
 * ne correspond plus à rien est supprimé sur-le-champ : sans cela, la liste
 * d'envoi ne fait que grossir, et chaque notification paie les téléphones
 * désinstallés depuis des mois.
 */

export type PushSendSummary = {
  attempted: number;
  delivered: number;
  dropped: number;
  failed: number;
};

const EMPTY_SUMMARY: PushSendSummary = { attempted: 0, delivered: 0, dropped: 0, failed: 0 };

/** Un avertissement par processus suffit : ce n'est pas une erreur, c'est une absence de configuration. */
let warnedAboutConfig = false;

function warnOnce(message: string): void {
  if (warnedAboutConfig) return;
  warnedAboutConfig = true;
  console.warn(`[push] ${message}`);
}

/**
 * Envoie à des appareils déjà choisis. C'est le point d'entrée du dépilage, qui
 * a paginé lui-même et ne veut pas que la liste soit rechargée.
 */
export async function sendToDevices(
  devices: PushDevice[],
  content: PushContent
): Promise<PushSendSummary> {
  if (!isPushEnabled()) {
    warnOnce("désactivé (PUSH_ENABLED absent) : aucun message ne part.");
    return EMPTY_SUMMARY;
  }
  if (devices.length === 0) return EMPTY_SUMMARY;

  const config = pushConfig();
  const ios = devices.filter((device) => device.platform === "ios");
  const android = devices.filter((device) => device.platform === "android");

  if (ios.length > 0 && !config.apns) warnOnce("APNs non configuré : les appareils iOS sont ignorés.");
  if (android.length > 0 && !config.fcm) warnOnce("FCM non configuré : les appareils Android sont ignorés.");

  const [apnsResults, fcmResults] = await Promise.all([
    config.apns
      ? sendApns(
          config.apns,
          ios.map((device) => ({ token: device.token, environment: device.environment })),
          buildApnsPayload(content),
          { collapseId: content.collapseId }
        )
      : Promise.resolve<PushSendResult[]>([]),
    config.fcm
      ? sendFcm(config.fcm, android.map((device) => device.token), buildFcmMessage(content), {
          collapseId: content.collapseId,
        })
      : Promise.resolve<PushSendResult[]>([]),
  ]);

  const results = [...apnsResults, ...fcmResults];

  const dropped = results.filter((result) => result.outcome === "drop-token").map((result) => result.token);
  const failed = results.filter((result) => result.outcome === "failed" || result.outcome === "retry");
  const corrected = apnsResults.filter((result) => result.environment);

  await Promise.all([
    deletePushDevicesByTokens(dropped),
    ...failed.map((result) => recordPushFailure(result.token, result.reason ?? `HTTP ${result.status}`)),
    ...corrected.map((result) => setPushDeviceEnvironment(result.token, result.environment!)),
  ]);

  // Une erreur de configuration touche tous les appareils à la fois : elle
  // mérite un journal bruyant, pas une ligne sur un document d'appareil.
  const misconfigured = results.filter((result) => result.outcome === "failed");
  if (misconfigured.length > 0) {
    console.error(
      `[push] ${misconfigured.length} envoi(s) refusé(s) — motifs : ${[
        ...new Set(misconfigured.map((result) => result.reason ?? `HTTP ${result.status}`)),
      ].join(", ")}`
    );
  }

  return {
    attempted: results.length,
    delivered: results.filter((result) => result.outcome === "delivered").length,
    dropped: dropped.length,
    failed: failed.length,
  };
}

/**
 * Envoie à des utilisateurs. Charge leurs appareils — en écartant ceux qui ont
 * coupé le push — et délègue.
 *
 * Pour un fan-out large, préférer `listActiveDevicesForUsers` paginé et
 * `sendToDevices` : cette fonction charge tout d'un coup.
 */
export async function sendPushToUsers(
  userIds: string[],
  content: PushContent
): Promise<PushSendSummary> {
  if (!isPushEnabled() || userIds.length === 0) return EMPTY_SUMMARY;

  const devices = await listActiveDevicesForUsers(userIds, { limit: 1000 });
  return sendToDevices(devices, content);
}
