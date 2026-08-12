# Tunnel de création d'un tournoi

`/tournaments/new` n'ouvre plus un formulaire mais un tunnel guidé, en plein
écran, qui pose une question à la fois et ne crée le tournoi qu'à la fin. Il est
aligné sur la maquette « Tunnel de création » de Claude Design ; les couleurs
restent celles de l'application (tokens shadcn, accent `sky`), et les deux
thèmes sont pris en charge.

## Pourquoi

Le formulaire d'avant ne demandait qu'un nom, un jeu et deux interrupteurs, puis
déposait l'organisateur dans le portail complet. Tout ce qui fait un tournoi —
la structure, le format des parties, le formulaire d'inscription, le QR code —
était à trouver soi-même dans une barre latérale de sept entrées. Le tunnel pose
ces questions dans l'ordre où elles se posent, et finit sur ce dont
l'organisateur a besoin dans la minute : le QR code et le code de participation.

## Parcours

| Étape | Question | Ce qu'elle écrit |
| --- | --- | --- |
| 1 | Nom du tournoi | `name` |
| 2 | Jeu (recherche, cartes, ou nom libre) | `gameId` ou `customGameName` |
| 3 | Format | le type des phases créées |
| 4 | Structure (rondes, taille de bracket, top cut) | `plannedRounds`, `topCut` |
| 5 | Format des parties (best of 1 / 3) | `bestOf` |
| 6 | Listes à l'inscription | `registrationForm` |
| — | QR code, code de participation, résumé | — |

Les étapes 4 à 6 ne sont posées que si elles s'appliquent : pas de structure hors
suisse / élimination, pas de best-of pour une épreuve chronométrée (elle ne
compte pas de parties), pas de question de listes hors jeu TCG ou de figurines.
Le bouton de création apparaît sur la dernière étape du parcours, quelle qu'elle
soit. Les étapes déjà répondues restent ouvertes derrière : revenir sur un choix
ne coûte rien, et changer de format réinitialise ce qu'il rendait caduc.

## Formats et phases créées

| Format du tunnel | Phases |
| --- | --- |
| Rondes suisses | une phase `swiss` |
| Élimination | une phase `bracket`, `topCut` = taille du bracket |
| Rondes suisses + élimination | `swiss` puis `bracket`, `topCut` = top cut choisi |
| Chronomètre | une phase `time-race` |
| Libre | une phase `freeform` |

« Auto » n'écrit rien : le nombre de rondes ou la taille du bracket est alors
décidé au démarrage de la phase, d'après les inscrits.

Le reste des réglages de phase garde ses valeurs par défaut, sauf pour un jeu qui
impose un preset de format (`defaultPresetForGameSlug`) : barème, appariement
suisse, mode de résultat et statistiques relevées sont alors repris du preset,
comme le fait déjà le formulaire de phase du portail. Le preset est résolu côté
serveur, dans `page.tsx`, et transmis avec chaque jeu — `lib/tournaments/game-presets`
tire des dépendances serveur et n'a pas sa place dans le paquet client.

## Formulaire d'inscription

Répondre « oui » à l'étape des listes écrit un formulaire d'une seule question de
type `decklist`, intitulée « Liste de deck » pour un TCG et « Liste d'armée » pour
un jeu de figurines. L'analyse de la liste reste ce qu'elle était : elle n'est
tentée que pour les jeux qui la supportent, ailleurs la saisie est conservée
telle quelle.

## Configuration avancée

Le bouton « Configuration avancée » de l'en-tête apparaît dès qu'un nom est
saisi. Il crée le tournoi avec ce qui a déjà été répondu — phases et formulaire
compris — puis mène directement au portail organisateur. Rien n'est perdu : le
raccourci quitte le tunnel, il n'annule pas les réponses.

## Jeu hors catalogue

L'étape du jeu accepte un nom libre, conservé dans `customGameName` sur le
tournoi. Il ne sert qu'à nommer le jeu : sans fiche de jeu, ni preset de format
ni analyse de liste ne s'appliquent, et l'étape des listes n'est pas posée.
Choisir un jeu du catalogue efface le nom saisi à la main — les deux ensemble
feraient afficher deux jeux différents pour le même tournoi. Le champ reste
modifiable dans « Réglages du tournoi », sous le sélecteur de jeu, tant qu'aucun
jeu du catalogue n'est choisi.

## Création

Tout est collecté côté client, puis écrit en trois temps :
`POST /api/tournaments`, un `POST …/phases` par phase (séquentiel : sans `order`
explicite, chaque phase se range derrière la précédente), et un
`PUT …/form` si des listes sont demandées.

Une fois le tournoi créé, l'échec d'une étape suivante n'est plus bloquant : il
est signalé sur l'écran final, avec le tournoi sous la main. Défaire un tournoi
déjà créé ne rendrait service à personne, et le cacher encore moins.

## Fichiers

| Rôle | Fichier |
| --- | --- |
| Tunnel | `app/tournaments/new/CreateTournamentWizard.tsx` |
| Pictogrammes des formats | `app/tournaments/new/FormatIcon.tsx` |
| Résolution des jeux et presets | `app/tournaments/new/page.tsx` |
| QR code de participation (partagé avec le portail) | `app/tournaments/useJoinQrCode.ts` |
| Traductions | `messages/{fr,en,de,it}.json`, sous `Tournaments.wizard` |
