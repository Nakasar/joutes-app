/**
 * Robots refusés sur tout le site, avant tout rendu.
 *
 * `robots.txt` (`lib/well-known/robots.ts`) le leur demande déjà, mais il
 * n'est relu qu'avec retard : ce refus s'applique tout de suite, dans le proxy.
 *
 * - Meta-ExternalAgent, le robot d'entraînement d'IA de Meta, a parcouru les
 *   fiches de cartes du 21 au 22 nov. 2026 : ~46 000 requêtes et ~2,6 Go sortis
 *   en 18 heures. Ce n'est pas facebookexternalhit, qui fabrique les aperçus
 *   des liens partagés sur Facebook, Instagram ou WhatsApp, et reste admis.
 * - SERankingBacklinksBot (outil d'analyse de liens) : ~1,5 Go les 9-10 nov.
 */
export const BLOCKED_BOT_AGENTS = ["meta-externalagent", "SERankingBacklinksBot"];

const BLOCKED_BOT = new RegExp(BLOCKED_BOT_AGENTS.join("|"), "i");

/** Vrai si l'agent est celui d'un robot refusé partout. */
export function isBlockedBot(userAgent: string | null): boolean {
  return !!userAgent && BLOCKED_BOT.test(userAgent);
}
