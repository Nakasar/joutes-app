import 'server-only';

/**
 * Les secrets d'envoi, lus en un seul endroit.
 *
 * Deux raisons de centraliser. D'abord les clés privées : Vercel stocke une
 * variable multiligne avec des `\n` littéraux, et une clé mal désérialisée
 * donne un `ERR_OSSL_UNSUPPORTED` qui ne dit rien de sa cause. Le
 * remplacement se fait ici, une fois.
 *
 * Ensuite l'absence : un environnement de développement ou un aperçu n'a aucune
 * de ces variables, et ne doit pas pour autant échouer. `pushConfig()` rend
 * alors `null`, et l'envoi ne fait rien — silencieusement, une fois journalisé.
 */

export type ApnsConfig = {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
};

export type FcmConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

export type PushConfig = {
  apns: ApnsConfig | null;
  fcm: FcmConfig | null;
};

/**
 * Une clé PEM telle que Vercel la rend : les retours à la ligne y sont deux
 * caractères, pas un. `node:crypto` refuse le PEM sans ses vraies coupures.
 */
function pem(value: string | undefined): string | undefined {
  return value?.replace(/\\n/g, "\n").trim() || undefined;
}

/**
 * L'arrêt d'urgence. Toute la mécanique peut être déployée en production sans
 * qu'un seul message ne parte, le temps de vérifier que le reste tient.
 */
export function isPushEnabled(): boolean {
  return process.env.PUSH_ENABLED === "1";
}

export function pushConfig(): PushConfig {
  const apnsKeyId = process.env.APNS_KEY_ID;
  const apnsTeamId = process.env.APNS_TEAM_ID;
  const apnsPrivateKey = pem(process.env.APNS_PRIVATE_KEY);
  const apnsBundleId = process.env.APNS_BUNDLE_ID;

  const fcmProjectId = process.env.FCM_PROJECT_ID;
  const fcmClientEmail = process.env.FCM_CLIENT_EMAIL;
  const fcmPrivateKey = pem(process.env.FCM_PRIVATE_KEY);

  return {
    apns:
      apnsKeyId && apnsTeamId && apnsPrivateKey && apnsBundleId
        ? { keyId: apnsKeyId, teamId: apnsTeamId, privateKey: apnsPrivateKey, bundleId: apnsBundleId }
        : null,
    fcm:
      fcmProjectId && fcmClientEmail && fcmPrivateKey
        ? { projectId: fcmProjectId, clientEmail: fcmClientEmail, privateKey: fcmPrivateKey }
        : null,
  };
}
