# Liste d'attente des événements

Un événement qui a un nombre maximum de participants ouvre une **liste d'attente** une fois complet. Les inscrits comme la file sont ordonnés par date d'arrivée, affichée à côté de chaque nom.

## Règles

Les règles vivent dans `lib/events/waitlist.ts` (module pur, testé par `waitlist.test.ts`) :

- **Rejoindre** : possible seulement quand l'inscription directe ne l'est plus — plus de place libre, ou des joueurs attendent déjà (on ne double pas la file).
- **Place libérée** : désistement, retrait par l'organisation, statut repassé en pré-inscrit/exclu, capacité augmentée, inscriptions rouvertes. Chaque place libre est **offerte** au premier de la file sans offre : il reçoit une notification (site + push mobile) et la place lui est **réservée** jusqu'à l'échéance.
- **Échéance** : `waitlistResponseHours` (48 h par défaut, réglable par l'organisation : 2, 6, 12, 24, 48 ou 72 h), raccourcie au début de l'événement s'il tombe avant.
- **Réponse** : accepter l'inscrit (`REGISTERED`, même pour un événement en pré-inscription : la place était déjà confirmée) ; décliner ou laisser expirer le sort de la file, et le suivant est notifié.
- **Places réservées** : une offre en cours compte comme une place prise — l'événement reste complet pour les autres.
- **Fin de file** : un événement annulé, commencé ou passé vide sa file (les joueurs en attente d'un événement annulé sont notifiés).

L'organisation peut aussi retirer un joueur de la file ou l'inscrire directement (dans la limite des places).

## Où ça se passe

| Quoi | Où |
|---|---|
| Données | `Event.waitlist` (`WaitlistEntry[]`), `Event.waitlistResponseHours`, `Event.participantRegisteredAt` |
| Écritures conditionnelles | `lib/db/event-waitlist.ts` |
| Avancement + notifications | `lib/events/waitlist-service.ts` (`advanceEventWaitlist`) |
| Actions serveur | `app/[locale]/(app)/events/actions.ts` |
| API (mobile) | `POST/DELETE /api/events/{id}/waitlist`, `POST …/waitlist/accept`, `POST …/waitlist/decline` ; `GET /api/events/{id}` renvoie `viewerWaitlist`, `waitlistCount`, `waitlistOpen`, `canJoinDirectly` (jamais la file brute) |
| Offres échues | cron `/api/cron/event-waitlists`, toutes les 15 minutes |

Les inscriptions antérieures à `participantRegisteredAt` n'ont pas de date : elles gardent l'ordre du tableau `participants`, en tête de liste.
