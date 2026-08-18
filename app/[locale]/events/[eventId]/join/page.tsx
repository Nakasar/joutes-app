import PageClient from "./PageClient";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * L'écran est entièrement client et lit lui-même le paramètre d'URL : cette
 * enveloppe serveur n'existe que pour porter l'opt-out, qu'un module
 * `"use client"` ne peut pas exporter.
 */
export default function Page() {
  return <PageClient />;
}
