import 'server-only';

export { lairHasPro as isLairPro } from "@/lib/subscriptions/access";

/**
 * Le lieu est-il Pro ?
 *
 * Simple ré-export de `lairHasPro`, l'API que documente `docs/SUBSCRIPTIONS.md`.
 * Ce module en tenait une seconde implémentation, qui ne connaissait que le
 * parrainage : les octrois de l'équipe y auraient été invisibles, et l'écran de
 * personnalisation aurait refusé à un lieu équipé ce que sa vitrine lui
 * accordait. Une règle, un endroit.
 */
