import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getEventById } from "@/lib/db/events.ts";
import { readPortalSettings } from "../portalSettings.ts";
import PlayerLayoutServer from "./components/PlayerLayoutServer.tsx";

// Blocage délibéré, pas une étape d'adoption restante.
//
// Le portail joueur est réservé aux participants de l'événement : prérendre le
// cadre reviendrait à montrer un portail à quelqu'un qu'on s'apprête à renvoyer.
// C'est le motif que la documentation Next cite pour garder une route bloquante
// (« auth, tenant, or other gating in a layout »).
//
// Les pages du portail, elles, ne portent plus d'opt-out : le cadre reste monté
// d'une section à l'autre, et seule la zone de contenu passe par son squelette.
export const instant = false;

/**
 * Cadre commun aux sections du portail joueur : titre, nom de l'événement, phase
 * en cours et barre de navigation. Il était jusqu'ici réinstancié par chaque
 * page, ce qui le faisait disparaître et revenir à chaque changement de section.
 *
 * La porte d'authentification reste dans les pages, volontairement : chacune
 * redirige vers `/login?from=…` avec **son propre chemin**, pour ramener le
 * visiteur exactement là où il allait. Sur un visiteur sans droit, la
 * redirection de la page interrompt le rendu avant que ce cadre n'atteigne le
 * navigateur.
 */
export default async function EventPlayerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  // Ce cadre rend à la requête par construction (voir le blocage ci-dessus), et
  // sa lecture de l'événement est sa première entrée-sortie : sans marquer le
  // rendu comme lié à la requête, le pilote Mongo consulte l'horloge en
  // établissant sa connexion et le prérendu échoue. Les pages y échappent parce
  // que leur lecture de session vient avant.
  await connection();

  const event = await getEventById(eventId);
  if (!event) {
    notFound();
  }

  const settings = await readPortalSettings(eventId);

  return (
    <PlayerLayoutServer event={event} settings={settings}>
      {children}
    </PlayerLayoutServer>
  );
}
