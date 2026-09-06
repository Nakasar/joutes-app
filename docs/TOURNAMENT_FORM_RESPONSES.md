# Réponses au formulaire d'inscription

Ce qu'un organisateur voit des réponses de tous les joueurs, d'un coup.

## Principe

La fiche d'un joueur (`…/organizer/players/:playerId`) reste le lieu de la
correction : on y relit et on y réécrit une réponse. Mais pour savoir qui n'a
pas rendu sa liste, ou comparer ce que trente joueurs ont répondu à la même
question, il fallait ouvrir trente fiches. La page **Réponses au formulaire**
(`…/organizer/form/responses`, atteinte depuis le bouton « Voir les réponses »
du constructeur de formulaire) les met toutes à plat : une ligne par joueur,
une colonne par question, dans l'ordre du formulaire.

- Le nom du joueur mène à sa fiche ; un joueur retiré reste listé, barré.
- Une réponse tardive porte le badge « Tardif » sur la ligne.
- Une liste de deck est résumée par son nombre de cartes (avec ses alertes :
  cartes non reconnues, bannies, liste non analysée) ; le texte complet se lit
  au survol.
- Un filtre par nom et l'interrupteur « Seulement ceux qui ont répondu ».

## Export CSV

`GET /api/tournaments/:id/form/export` (staff, session) renvoie le même tableau
en CSV : joueur, statut, une colonne par question (son libellé en en-tête), la
date de dernière réponse et le marqueur de réponse tardive. Le texte complet
est exporté — une liste de deck entière tient dans une cellule, sauts de ligne
compris — et les cellules commençant par un caractère de formule sont
neutralisées comme dans l'export des matchs.

## Modules

| Fichier | Rôle |
| --- | --- |
| `lib/tournaments/form-export.ts` | mise à plat (une ligne par joueur, une cellule par champ) et CSV. **Pur, testé.** |
| `app/api/tournaments/[tournamentId]/form/export/route.ts` | l'export. |
| `app/[locale]/(app)/tournaments/[tournamentId]/organizer/form/responses/` | la page et son tableau. |
