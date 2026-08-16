# Succès de compte et récompenses

Notre plateforme propose un système de succès et de récompenses pour encourager l'engagement des utilisateurs. Voici un aperçu des fonctionnalités disponibles :

Les succès disponibles sont ajoutés dans une collection `achievements`.

Les succès débloqués par les utilisateurs sont stockés dans une collection `user-achievements`, associant chaque succès à un utilisateur spécifique.

## Fonctionnalités principales

- **Affichage des succès** : Les utilisateurs peuvent consulter les succès qu'ils ont débloqués ainsi que ceux qui sont encore à atteindre (page `/account/achievements`), et voir les succès disponibles qu'ils n'ont pas encore décrochés.
- Les succès sont également affichés sur le profil de l'utilisateur (page `/users/[userTagLine]`).

## Statuts

Un succès marqué **`isStatus`** ne s'affiche pas seulement dans la liste des
succès : il apparaît en badge à côté du pseudonyme, avec sa teinte.

C'est délibérément le même objet qu'un succès ordinaire. Catalogue, attribution
et retrait sont déjà écrits ; un second système n'aurait apporté qu'une seconde
interface d'administration à tenir.

Ce qu'un statut n'est pas : **il n'ouvre aucun droit**. C'est de la
reconnaissance, pas de l'accès — les droits s'achètent ou s'accordent par
`grantedPlans` (voir `docs/SUBSCRIPTIONS.md`). Un compte peut porter un statut et
une offre payée en même temps, les deux badges côte à côte.

Trois règles d'affichage, dans `lib/achievements/status.ts` :

- **visible même sur un profil privé**, comme le badge d'offre : un profil privé
  l'est sur son contenu, et une marque posée par l'équipe n'en est pas ;
- **ordre chronologique**, pour que « Fondateur » reste à gauche quand un autre
  statut s'ajoute des mois plus tard ;
- **trois au maximum**, au-delà desquels un pseudonyme se noie.

Cocher « statut » dans le formulaire met les points à zéro : c'est une
reconnaissance et non une performance, et la laisser peser fausserait le total.

Les teintes vivent dans `lib/achievements/status-tone.ts`, séparées de celles des
offres — un test vérifie qu'aucune ne coïncide, un « Fondateur » qui porterait les
classes de Supporter se lisant comme un abonné.

## Retirer un succès

`revokeAchievementById(userId, achievementId)`, depuis le profil de la personne.
N'existait pas jusqu'ici : un succès accordé par erreur ne pouvait être repris
qu'en le supprimant du catalogue, donc pour tout le monde.

⚠️ `achievementId` y est comparé **en tant que chaîne**, sans `ObjectId` — c'est
ainsi qu'il est inséré. L'envelopper ne supprimerait silencieusement rien.
