# Refonte du portail de tournoi

Refonte de l'interface du portail de tournoi (`/tournaments`), alignée sur la
maquette « Proposition — gestion de tournoi » de Claude Design. Le style visuel
de l'application est conservé (shadcn/ui, palette neutre, Geist / Geist Mono) :
la refonte porte sur la structure des écrans et sur les gestes du jour J, pas sur
la direction artistique.

## Principes

- **L'organisateur travaille debout, en salle.** L'écran de ronde privilégie les
  cartes de table, la saisie en un geste et un rail « à traiter » qui rassemble
  ce qui bloque la clôture.
- **Le joueur ne lit qu'une chose à la fois.** Le portail joueur répond à « où je
  joue, contre qui, combien de temps », le reste passe sous la ligne de flottaison.
- **Chaque écran dit ce qui est figé et ce qui bouge.** Un classement validé et un
  classement en direct ne se lisent pas pareil : le badge le rappelle.

## Structure des écrans

### Liste des tournois (`/tournaments`)

Carte héro pour le tournoi en cours (ronde, minuteur en direct, accès direct au
pilotage), grille des autres tournois, puis section « Où je joue ». L'endpoint
`GET /api/tournaments` renvoie un `summary` par tournoi (participants, format,
ronde en cours) pour éviter une requête par carte.

### Portail organisateur

Barre latérale en deux groupes, avec compteurs :

| Groupe | Sections |
| --- | --- |
| Pendant le tournoi | Ronde en cours · Classement · Salle & annonces |
| Préparation | Joueurs · Format & phases · Réglages du tournoi |

Le layout `organizer/layout.tsx` centralise l'authentification et le chargement du
contexte (`organizerContext.ts`) ; chaque page ne porte plus que son contenu.

- **Ronde en cours** — bandeau collant (repère de ronde, minuteur, +2 min,
  annonce, impression), carte de progression avec filtres et bascule
  grille/tableau, saisie rapide du score, rail « à traiter », barre de clôture.
- **Classement** — écran dédié, navigable ronde par ronde, avec OMW% / GW%,
  ligne de coupe et export CSV.
- **Salle & annonces** — messages tout prêts, message urgent, panneau de
  projection reprenant le minuteur en grand.
- **Joueurs** — pointage à l'arrivée en première colonne, fiche joueur détaillée.
- **Format & phases** — déroulé en cartes d'étapes avec pastilles de rondes.
- **Réglages** — informations pratiques, réglages expliqués, résumé joueur et QR.

L'assistant « passer à la phase suivante » se déplie en trois temps :
vérifications, top cut, appariements.

### Portail joueur

En-tête sombre permanent (tournoi, ronde, minuteur, dernière annonce), grand
numéro de table, saisie du résultat en deux touches via une feuille en bas
d'écran, et barre d'onglets au pouce (Mon match · Classement · Tournoi).

## Fonctionnalités ajoutées

Ces fonctionnalités n'existaient pas avant la refonte.

### Prolongations par table

Champ `extensionSeconds` sur le match, accordé par pas de 3 minutes via
`PATCH /api/tournaments/:id/matches/:matchId` avec `{ action: "extend", seconds }`.
Réservé au staff. Le total est borné à zéro ; `seconds: 0` retire la prolongation.
Visible côté organisateur (carte de table et rail dédié) et côté joueur.

### Pointage à l'arrivée

Champ `checkedInAt` sur le joueur, indépendant du statut d'inscription : le
pointage constate une présence physique, là où `status` porte l'inscription.
Piloté par `PATCH …/players/:playerId` avec `{ checkedIn: boolean }`.

### Pénalités et notes internes

Deux collections (`tournament-penalties`, `tournament-notes`), réservées au staff.

- Sanctions typées : avertissement, partie perdue, match perdu, disqualification.
  Une disqualification retire aussi le joueur du tournoi.
- Notes internes visibles de l'équipe d'organisation uniquement, jamais du joueur.

Routes : `…/players/:playerId/penalties[/:penaltyId]` et `…/players/:playerId/notes[/:noteId]`.

### Journal d'activité

Collection `tournament-activity`, alimentée par les actions existantes (résultats,
litiges, annonces, rondes, pointages, sanctions) et lue par le rail « Activité ».

Volontairement tolérant aux pannes : `recordActivity` n'échoue jamais bruyamment,
le journal est un confort d'affichage et ne doit pas faire tomber un rapport de
résultat. Fenêtre glissante de 200 événements par tournoi.

### Listes de deck

Champ `decklist` sur le joueur (contenu libre + état de vérification par
l'arbitrage). Modifier le contenu invalide la vérification précédente : une liste
retouchée doit être revérifiée. Route `…/players/:playerId/decklist`.

### Informations pratiques du tournoi

Champs `location`, `startsAt` et `capacity` sur le tournoi. Pré-remplis depuis
l'événement lié à la création quand `eventId` est renseigné, puis portés en propre :
modifier l'événement ne les change plus, et un tournoi sans événement reste
renseignable à la main.

### Export du classement

`GET /api/tournaments/:id/standings/export[?roundId=]` produit un CSV (séparateur
`;`, BOM UTF-8) du classement courant ou du classement figé d'une ronde. Réservé
au staff : le fichier porte les noms des joueurs.

## Points d'attention

- **Les numéros de ronde repartent à 1 à chaque phase.** Ils ne peuvent donc pas
  servir à ordonner les rondes d'un bout à l'autre du tournoi : c'est `createdAt`
  qui fait foi (résolution de la ronde courante, historique d'un joueur,
  rattachement d'une sanction).
- **La saisie rapide ne couvre que les duels en mode « désignation du
  vainqueur ».** Les formats en points et les matchs multijoueurs passent par la
  saisie détaillée partie par partie ; `buildQuickResults` renvoie une liste vide
  et l'interface bascule d'elle-même.
- **La clôture d'une ronde enchaîne deux gestes** (figer le classement, générer la
  ronde suivante). Si la seconde étape échoue, le message le dit explicitement :
  le classement est déjà figé.
