# Événements et tournois

## Qui fait quoi

| | Événement | Tournoi |
| --- | --- | --- |
| Rôle | Le rendez-vous : un repère dans l'agenda | Le déroulé de la session |
| Porte | Date, lieu, prix, lien vers le site du lieu | Phases, rondes, appariements |
| | Inscriptions, pré-inscriptions, places | Joueurs et leur statut |
| | Liste d'attente et offres de place | Résultats, classements, départages |
| | Annonces aux inscrits | Minuteur, écran de salle, annonces de salle |
| Page | `/events/:eventId` | `/tournaments/:tournamentId/...` |

Un événement déclare **au plus un** tournoi, par `Tournament.eventId`. Un
tournoi peut exister sans événement (tournoi improvisé, ligue).

## La page d'un événement

Tout clic sur un événement mène à `/events/:eventId` : agenda (grille et
liste), agenda d'un lieu, vue « salle » d'un lieu. La fenêtre de détails de
l'agenda a disparu, et le site externe du lieu n'est plus la destination du
clic : il figure en encart « Voir sur le site du lieu » sur la page.

La page se lit de haut en bas :

1. **En-tête** — repère de calendrier, jeu, statut, nom, date, horaires, lieu.
2. **Inscription** (colonne de droite, en tête sur mobile) — prix, remplissage,
   inscription / liste d'attente, favori, puis l'encart vers le site du lieu.
3. **À propos** — la description.
4. **Tournoi** — visible de tous. Sans tournoi, l'organisation le crée ou en
   lie un existant. Avec, chacun y trouve sa porte : espace joueur pour les
   joueurs du tournoi, pilotage pour son staff, écran de salle pendant qu'il
   se joue.
5. **Annonces** — pour les inscrits et l'organisation, qui les publie.
6. **Organisation** — inscrits, liste d'attente, intéressés (favoris).

## Créer le tournoi d'un événement

« Créer le tournoi » ouvre le tunnel de création avec `?eventId=`. Le tunnel :

- pré-remplit le nom et, quand il est au catalogue, le jeu de l'événement ;
- crée le tournoi associé (`eventId`), qui reprend lieu, date et capacité ;
- transfère les inscrits comme joueurs, puis ramène à l'événement.

`POST /api/tournaments` avec un `eventId` exige les droits d'organisation sur
l'événement (créateur ou staff organisateur, `canManageEvent`) et refuse un
second tournoi pour le même événement — les mêmes règles qu'au rattachement
d'un tournoi existant par `PATCH`.

## Transfert des inscrits

Le transfert (`/api/tournaments/:id/import-event-players`) recopie les inscrits
de l'événement dans les joueurs du tournoi :

| Inscription | Joueur |
| --- | --- |
| Inscrit (ou sans statut) | `registered` |
| Pré-inscrit | `pre-registered` |
| Exclu | `dropped` |
| Non inscrit, liste d'attente | non transféré |

Il se rejoue sans risque : il n'ajoute que les absents et aligne le statut des
présents. La section Tournoi indique à l'organisation combien de changements
un nouveau transfert appliquerait.

## L'ancien portail d'événement

Avant les tournois, un événement portait lui-même ses phases, ses matchs et son
classement (`/events/:eventId/portal`, collections `event-portal-settings` et
`matches`). Le tournoi associé a repris ce rôle.

Le portail n'est plus proposé qu'aux événements qui l'ont déjà utilisé
(`hasLegacyEventPortal`), dans un encart « Ancien portail » : leurs données
restent consultables. **Rien n'est migré ni supprimé.** Les annonces
(`event-announcements`) restent celles de l'événement et s'affichent
désormais sur sa page.
