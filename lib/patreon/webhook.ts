import crypto from "node:crypto";

/**
 * Vérification de la signature des webhooks Patreon.
 *
 * Patreon signe le corps de la requête en HMAC-MD5 et pose l'empreinte
 * hexadécimale dans l'en-tête `X-Patreon-Signature`. MD5 n'est pas notre choix ;
 * on compense par une comparaison à temps constant et en gardant le webhook sans
 * effet de bord au-delà de l'écriture de l'abonnement.
 *
 * **Le corps signé est celui des octets reçus.** C'est le seul point qui compte
 * vraiment ici, et il est facile à rater : le webhook Discord de ce dépôt
 * (`app/discord/route.ts`) vérifie `JSON.stringify(await req.json())`, donc un
 * corps **re-sérialisé**. Cela ne fonctionne que parce que le JSON de Discord
 * fait un aller-retour identique dans V8 — ce n'est pas une vérification de
 * signature correcte, et cela casse au premier flottant, au premier caractère
 * échappé différemment, au premier ordre de clés inattendu. La route Patreon lit
 * donc `await req.text()` et ne parse qu'ensuite. Un test de non-régression
 * vérifie qu'un corps re-sérialisé donne bien une empreinte différente.
 */

/** En-têtes posés par Patreon sur chaque livraison. */
export const PATREON_SIGNATURE_HEADER = "x-patreon-signature";
export const PATREON_EVENT_HEADER = "x-patreon-event";

/**
 * Déclencheurs auxquels s'abonner côté Patreon.
 *
 * Ce sont ceux de l'API v2. Les `pledges:*` de la v1 sont retirés le
 * 7 octobre 2026 : les enregistrer reviendrait à bâtir sur un plancher qui
 * disparaît.
 */
export const PATREON_TRIGGERS = [
  "members:create",
  "members:update",
  "members:delete",
  "members:pledge:create",
  "members:pledge:update",
  "members:pledge:delete",
] as const;

export type PatreonTrigger = (typeof PATREON_TRIGGERS)[number];

export function isPatreonTrigger(trigger: string): trigger is PatreonTrigger {
  return (PATREON_TRIGGERS as readonly string[]).includes(trigger);
}

/**
 * L'empreinte attendue pour ce corps et ce secret.
 *
 * Isolée pour que le test puisse la comparer à une valeur calculée à la main, et
 * pour que le script de mise au point local (voir `docs/SUBSCRIPTIONS.md`)
 * signe ses fixtures exactement comme Patreon le ferait.
 */
export function patreonSignature(rawBody: string, secret: string): string {
  return crypto.createHmac("md5", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * Vraie si la signature reçue correspond au corps brut.
 *
 * Ferme par défaut : un secret vide, un en-tête absent ou une empreinte de
 * longueur inattendue rendent `false` plutôt que de laisser passer. La
 * comparaison ne se fait qu'entre deux tampons de même longueur —
 * `timingSafeEqual` **jette** sinon, et un en-tête malformé deviendrait une
 * erreur 500 au lieu d'un refus.
 */
export function verifyPatreonSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!secret || !signature) {
    return false;
  }

  const expected = patreonSignature(rawBody, secret);

  // Comparer les octets, pas les chaînes : deux empreintes hexadécimales de
  // longueurs différentes ne peuvent pas correspondre, et le contrôle évite
  // l'exception de `timingSafeEqual`.
  if (signature.length !== expected.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}
