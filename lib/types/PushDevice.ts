/**
 * Un appareil qui a accepté de recevoir les notifications Joutes.
 *
 * C'est la seule chose que la plateforme sait d'un téléphone : un jeton, qui
 * l'identifie auprès d'Apple ou de Google, et de quoi le reconnaître pour le
 * retirer. Pas d'identifiant matériel, pas de numéro — un jeton se révoque, et
 * c'est tout ce qu'on veut pouvoir faire.
 */

export type PushPlatform = "ios" | "android";

/**
 * Un jeton APNs vaut pour un seul environnement. Celui d'un build de
 * développement ne fonctionne que sur `api.sandbox.push.apple.com`, celui d'un
 * build TestFlight ou App Store seulement sur `api.push.apple.com` — et Apple
 * répond au croisement par un `BadDeviceToken` qu'on prendrait volontiers pour
 * un jeton mort. On retient donc l'environnement qui a marché.
 */
export type PushEnvironment = "production" | "sandbox";

export type PushDevice = {
  id: string;
  userId: string;
  platform: PushPlatform;
  /** Jeton APNs (hexadécimal) sur iOS, jeton d'enregistrement FCM sur Android. */
  token: string;
  /**
   * Identifiant de l'installation, généré et conservé par l'app. Le jeton, lui,
   * tourne : l'OS en redonne un nouveau après une réinstallation ou une
   * restauration de sauvegarde. Sans ce repère, la même installation
   * accumulerait un appareil par rotation dans la liste du compte.
   */
  installationId: string;
  /** iOS seulement. */
  environment?: PushEnvironment;
  /** Langue de l'appareil, pour le jour où les notifications seront traduites. */
  locale?: string;
  appVersion?: string;
  /**
   * `revoked` : l'utilisateur a retiré l'appareil, depuis son compte ou en se
   * déconnectant de l'app. On garde la ligne — un ré-enregistrement volontaire
   * la réveille. Un jeton que le fournisseur déclare mort, lui, est supprimé.
   */
  state: "active" | "revoked";
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string;
  /** Diagnostic seulement : un échec dur supprime le document. */
  lastErrorAt?: string;
  lastError?: string;
};

/**
 * Ce qu'on montre d'un appareil dans le compte. Le jeton n'y figure jamais :
 * c'est un secret d'envoi, et huit caractères suffisent à reconnaître son
 * téléphone dans une liste pour l'en retirer.
 */
export type PushDeviceSummary = Pick<
  PushDevice,
  "id" | "platform" | "installationId" | "appVersion" | "createdAt" | "lastSeenAt" | "state"
> & { tokenPreview: string };

export function toPushDeviceSummary(device: PushDevice): PushDeviceSummary {
  return {
    id: device.id,
    platform: device.platform,
    // L'identifiant d'installation n'est pas un secret : c'est l'application
    // qui l'a produit. Le lui rendre lui permet de reconnaître son propre
    // appareil dans la liste, quand elle a perdu l'identifiant serveur.
    installationId: device.installationId,
    appVersion: device.appVersion,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
    state: device.state,
    tokenPreview: device.token.slice(-8),
  };
}
