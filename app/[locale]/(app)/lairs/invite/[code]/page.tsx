import type { ComponentProps } from "react";

import PageClient from "./PageClient.tsx";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * L'écran est entièrement client et ne tient qu'au paramètre d'URL : cette
 * enveloppe serveur n'existe que pour porter l'opt-out, qu'un module
 * `"use client"` ne peut pas exporter. Les props sont retransmises telles
 * quelles, `params` compris, qui reste une promesse jusqu'au client.
 */
export default function Page(props: ComponentProps<typeof PageClient>) {
  return <PageClient {...props} />;
}
