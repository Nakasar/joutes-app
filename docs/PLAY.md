# Jouer (table de jeu Riftbound)

Page `/games/riftbound/play`, ouverte par la fonctionnalité de jeu « Jouer »
(admin du jeu, onglet Fonctionnalités). Le moteur vient du dépôt
`joutes-engine` (Rust) : il connaît les règles, publie les actions permises et
raconte chaque évènement en citant la règle. Le site ne contient aucune règle.

## Les façons de jouer

| | Où tourne la partie | Ce qu'il faut |
|---|---|---|
| Contre l'IA | Dans le navigateur (WebAssembly) | Rien. La partie est gardée dans `localStorage` et reprend au rechargement. |
| IA contre IA (spectateur) | Dans le navigateur, comme contre l'IA | Rien. La sauvegarde a `seat: null` ; voir « Regarder des IA » plus bas. |
| En ligne | Sur le serveur de parties (`joutes-server serve`) | Les variables `JOUTES_ENGINE_*` (voir `.env.example`). |
| Scellé et draft contre l'IA | Dans le navigateur, comme contre l'IA | Rien. Voir « Scellé et draft » plus bas. |
| Scellé et draft en ligne | Sur le serveur de parties, qui seul voit les boosters | La salle d'attente (`limitedEvents`) et un ticket par personne. |
| Mon serveur (mode hôte) | Sur un serveur lancé par un organisateur (`joutes-server host`) | L'adresse et le code du serveur, saisis dans la page. Joutes ne les voit pas. |

Le mode hôte sert aux deux jeux : `components/play/HostPanel.tsx` reçoit de
chaque lobby un `HostKit` (sièges, configuration du moteur, deck automatique,
lecture du deck d'un invité, champ `game` pour le serveur). Le lien d'invitation
mène à `/games/<jeu>/play/remote` (`RemoteGame`, `swu/SwuRemoteGame`).

Contre l'IA et en IA contre IA, la case « Listes ouvertes » du lobby met
`open_decklists` dans la configuration : les IA connaissent alors les cartes du
deck d'en face, sans leur ordre ni la main. Sans elle, une IA ne sait de
l'adversaire que sa légende et ce qu'il a déjà montré (voir `docs/ia.md` de
`joutes-engine`).

## Réservé aux abonnés

Trois fonctionnalités dépendent d'un abonnement (`lib/constants/subscription-plans.ts`) :

| Droit | Offres | Ce qu'il ouvre |
|---|---|---|
| `sub:play-host` | Joutes Pro, Joutes Expert | Créer une table en ligne (`createTableFor`), créer un scellé ou un draft en ligne (`createLimitedEventAction`) et le mode hôte « Mon serveur » (`resolveDeckAction`, le deck d'un invité). |
| `sub:play-simulate` | Joutes Expert | Toutes les actions de « Simuler un deck » (`simulation-actions.ts`), sauf supprimer une série. |
| `sub:play-filmed` | Joutes Pro, Joutes Expert | La table filmée : la page et `filmedArtAction` (les illustrations à reconnaître). |

Rejoindre une table, jouer contre l'IA et regarder des IA restent libres. Un
refus sort avec le code `SUBSCRIPTION` (403 sur les routes REST). Le lobby
reçoit `access: { canHost, canSimulate, canFilm }` et montre `PlanUpsell` à la place
d'un bouton qui échouerait. Un administrateur a tous les droits, et
`devForcedPlans` force un palier hors production.

Le mode hôte tourne dans le navigateur contre un serveur que Joutes ne voit
pas : le site masque le panneau et refuse de lire le deck d'un invité, mais ne
peut pas empêcher quelqu'un d'appeler lui-même son propre serveur.

## Le moteur dans ce dépôt

- `lib/engine/pkg/` : le moteur compilé pour le navigateur, copié depuis
  `joutes-engine` (`scripts/build-wasm.sh`, dossier `pkg/web`). `VERSION` dit de
  quel commit. Pour le mettre à jour : reconstruire, recopier les quatre
  fichiers, mettre `VERSION` à jour, ainsi que `ENGINE_VERSION`
  (`lib/engine/version.ts`, vérifié par son test).
- `scripts/build-engine.mjs` (lancé par `predev` et `prebuild`) écrit
  `lib/engine/wasm.generated.ts`, hors git : le même binaire en base64, pour le
  serveur (`lib/engine/server.ts` : validation des decks, arbitrage).
- `lib/engine/browser.ts` charge le binaire dans le navigateur, au premier
  besoin seulement.
- Identifiants : le catalogue écrit `OGN001`, le moteur `OGN-001`
  (`lib/engine/cards.ts`). Jamais de correspondance par le nom.

## La table

`components/play/GameTable.tsx` dessine un `EngineUpdate` (la vue, la question
posée, les évènements) et renvoie au moteur l'une des actions qu'il propose.
`lib/engine/anchors.ts` accroche chaque action à ce qu'elle désigne sur la
table ; ce qui ne se désigne pas devient un bouton. La même table sert aux
trois façons de jouer : seule la source change (`useSoloGame`, `useOnlineGame`).

Le moteur rend tout ce qui s'est passé depuis la dernière question d'un seul
bloc ; la table le raconte pas à pas (`components/play/usePacedFeed.ts`,
règles pures dans `lib/engine/pacing.ts`). Chaque évènement raconté reste au
premier plan selon son poids (350 ms, 900 ms ou 1,5 s, moitié moins pour ses
propres actions, multiplié par la vitesse choisie), la carte concernée
s'entoure d'ambre, une carte jouée par un adversaire s'affiche en grand, une
unité qui meurt reste dessinée le temps de le dire. Aux moments clés (carte
jouée ou capacité activée par un adversaire, fin de combat, points marqués hors
combat, début de son tour avec le résumé du tour adverse), la lecture attend
« Continuer ». La question n'apparaît qu'une fois le récit rattrapé ; contre
l'IA, le robot attend la fin du récit (`GameFeed.hold`). Vitesse et arrêts se
règlent depuis le bandeau du récit et sont gardés dans le navigateur
(`joutes.play.pace`). Un retard de plus de 60 évènements (reconnexion) se
rattrape d'un coup.

Les effets des cartes (éclair, comètes, souffle de feu…) se dessinent sur un
calque au-dessus de la table (`components/play/TableFx.tsx`, dessin dans
`components/play/fx-engine.ts`, règles pures dans `lib/engine/card-fx.ts`). Le
**geste** vient des évènements du moteur : quand une carte se résout, elle
apparaît au bord de la table et frappe d'un coup toutes les unités que la suite
de sa résolution blesse ; une mort, un bonus de Puissance, un étourdissement,
un jeton, une carte contrée ont chacun leur geste, et les dégâts de combat
heurtent le champ de bataille. La **matière** (12 : éclair, comètes, feu,
arcanes, lumière, explosifs, acier, coup, glace, néant, ombre, vent) dit comment
la carte frappe et teinte ses autres gestes ; `matterOf` la déduit du nom du
sort, du champion ou de la faction, sinon c'est la couleur du domaine. Elle
voyage avec les cartes de la table (`TableCard.fx`, avec `def`, le numéro de la
carte dans les évènements). Pour corriger une carte : `CHOSEN` dans
`card-fx.ts`. Rien en « Instantané » ou avec « Effets des cartes » décoché
(décoché d'office quand le système demande moins d'animations, tant qu'on ne
l'a pas coché) ; le moteur n'en sait rien. Les cartes de la table se gardent une
heure dans le navigateur : leur adresse porte `ENGINE_VERSION` et
`TABLE_CARDS_SHAPE` (`useTableCards.ts`), à monter quand leur forme change.

## Choisir les decks

Chaque siège de « Qui joue ? » a sa combobox (`DeckPicker`) : mes decks, ceux
partagés dans mes groupes (`playGroupDecks`), les publics (les 20 plus aimés au
chargement, puis `searchPlayDecksAction` pendant la frappe), les decks
automatiques autour d'une légende et, pour une IA, « au hasard ». Chaque deck
est traduit puis vérifié par le moteur côté serveur (`loadLobby`) : un deck
refusé reste dans la liste, grisé, avec sa raison. En ligne, un deck privé
partagé dans un de mes groupes se lit aussi (`readDeckAccess`). Les IA
ajoutées à une table en ligne ou sur un serveur gardent un deck automatique.

## Regarder des IA

« IA contre IA » lance une partie dans le navigateur dont tous les sièges sont
des robots. La table la montre en spectateur (`GameFeed.seat === null`) : vue
d'arbitre (`update(-2)`) pour voir les mains, sinon vue de spectateur
(`update(-1)`) ; la question d'une IA n'est jamais posée. Pause (bouton ou
Espace) : le récit s'arrête et les robots attendent (`hold`). En pause,
« Évènement suivant » montre l'évènement suivant, ou fait jouer le coup
suivant d'une IA (`GameFeed.step`) quand le récit a rattrapé la partie. Les
arrêts « Continuer » sont désactivés d'office en spectateur (`watchStops`).

## En ligne

- Une table est un document `gameTables` (`lib/db/game-tables.ts`), dont le code
  sert de lien d'invitation. Règles dans `lib/engine/tables.ts`.
- Au lancement, le site envoie la configuration au serveur de parties
  (`POST /games`), puis signe un ticket par personne (`lib/engine/tickets.ts`,
  HMAC-SHA256, même format que `joutes-session`). Le navigateur ouvre la
  WebSocket du serveur avec ce ticket. Un visiteur reçoit un ticket de
  spectateur.
- À la fin, le serveur appelle `POST /api/engine/result`, signé avec le même
  secret. Si cet appel se perd, la table est rapprochée du serveur à sa
  prochaine lecture (`reconcileTable`) : finie, ou abandonnée si le serveur ne
  connaît plus la partie.
- S'asseoir, partir et lancer sont des écritures conditionnelles : deux
  personnes qui agissent en même temps ne peuvent ni dépasser la capacité, ni
  lancer une partie avec un siège parti.
- Chaque lancement crée sa propre partie sur le serveur (`engineId`,
  `<code>-<aléa>`) : un lancement raté puis repris ne retombe jamais sur une
  partie créée avec d'anciens sièges.
- Une personne n'a qu'une table en attente : en ouvrir une autre annule la
  précédente. Les tables annulées sont effacées après une semaine.

## Arbitrage (MCP)

`riftbound_judge_simulate` et `riftbound_judge_review` (`app/mcp/tools-judge.ts`)
font tourner le moteur dans le processus du site ; `swu_judge_simulate` et
`swu_judge_review` font de même pour Star Wars: Unlimited (règles des
Comprehensive Rules 8.0, citées par leur numéro faute de page de règles sur le site). La relecture d'une table en
ligne n'est ouverte qu'à ses joueurs, une fois la partie finie : le journal
montre les mains. Les deux outils de relecture demandent un compte, et ce que le
moteur rejoue est borné en taille.

## Limites connues

- Les textes du moteur (questions, journal) sont en français seulement.
- Le moteur joue les extensions OGN et OGS.
- Un choix de mode s'affiche « Option 1 / Option 2 » ; le texte de la carte est
  montré à côté.
- Depuis une page https, le navigateur refuse un serveur hôte sans chiffrement,
  sauf `localhost`.

## Simuler un deck

`/games/riftbound/play/simulate` : une série de N parties IA contre IA pour
évaluer un deck, contre un deck précis ou un deck tiré à chaque partie dans des
ensembles (decks méta, mes decks, groupes, publics, automatiques).

- Les parties tournent dans le navigateur, dans un worker
  (`components/play/simulation.worker.ts`, fonction `simulate` du moteur).
  Rien ne tourne sur Vercel.
- Une série est un document de `deckSimulations` (`lib/db/deck-simulations.ts`,
  index dans `lib/db/indexes/users.ts`) : les decks figés à la création, puis
  chaque partie (graine, adversaire, siège, premier joueur, résultat, tours,
  score), envoyée par lots. `npm run indexes` après déploiement.
- Le deck évalué change de siège toutes les deux parties et le premier joueur
  alterne (`gameSeating`, `lib/engine/simulation.ts`).
- « Revoir » rouvre la partie dans la table spectateur : même configuration,
  même graine, mêmes niveaux, donc les mêmes coups — tant que le moteur est le
  même (`ENGINE_VERSION`, gardé dans la série).
- La fourchette affichée est l'intervalle de Wilson à 95 %.

## Table filmée

`/games/riftbound/play/filmed` suit une partie réelle filmée du dessus (caméra,
ou fichier vidéo pour une relecture) : les cartes sont reconnues dans l'image,
le moteur explique chaque changement de la table et signale ce que les règles
ne permettent pas. Réservée aux abonnés Joutes Pro et Joutes Expert
(`sub:play-filmed`, voir « Réservé aux abonnés »).

- Tout tourne dans le navigateur, dans un Web Worker
  (`components/play/filmed/filmed.worker.ts`) qui charge `lib/engine/track/pkg/`
  (`pkg/track` de joutes-engine : `TableReader` lit l'image, `Tracking` suit la
  partie ; voir son `docs/suivi.md`). La vidéo ne quitte pas l'ordinateur.
- Les cartes se reconnaissent à leur illustration, parmi celles des deux decks :
  les deux listes sont obligatoires. `filmedArtAction` rend les illustrations
  d'un deck, variantes comprises ; elles passent par
  `/api/games/riftbound/play/filmed/art/<carte>` parce que le navigateur doit en
  lire les pixels, ce que l'hébergeur des images n'autorise pas depuis un autre site.
- `lib/filmed/` : fonctions pures et testées (`layout.ts` : zones, taille des
  cartes, champs de bataille posés, corrections de l'opérateur ; `journal.ts` :
  journal et rapport).
- Écrans : `FilmedSetup` (decks, source, calibrage), `FilmedStage` (image et
  incrustation, zones réglables), `FilmedLive` (table reconstituée, écart,
  question, carte à confirmer, journal), `FilmedReport`.
- Une image toutes les demi-secondes ; seuls les endroits qui ont bougé puis se
  sont posés sont relus. Un fichier vidéo avance au rythme de la lecture et
  attend la réponse de l'arbitre à chaque écart ou question.
- Ce que la caméra ne voit pas se saisit : score, cartes face cachée
  (« Corriger la table »). « La table a raison » remet le suivi d'accord avec
  l'image sans passer par les règles.
- Pas encore : report du résultat au tournoi, identification par IA d'une carte
  douteuse, saisie des dégâts, enregistrement de la vidéo de la caméra, SWU et
  Cyberpunk.
- Le paquet se met à jour comme les autres : `scripts/build-wasm.sh` dans
  joutes-engine, copier `pkg/track/*` dans `lib/engine/track/pkg/` et noter le
  commit dans son fichier `VERSION`.

## Pour l'app mobile

L'app mobile (`joutes-mobile`) ne peut pas appeler les actions serveur : les
mêmes actions sont exposées en REST sous `/api/games/<jeu>/play/…`
(`lib/engine/play-api.ts`, une route attrape-tout par jeu à côté de `cards`).
`GET lobby`, `GET decks?q=`, `POST decks/resolve`, `POST tables`,
`GET tables/{id}`, `POST tables/{id}/join|bots|leave|start` ; pour le scellé
et le draft en ligne (Riftbound et Star Wars: Unlimited, `lib/engine/limited-play-api.ts`) :
`GET events`, `POST events`, `GET events/{id}`, `POST events/{id}/join|bots|leave|start`. Les réponses
gardent la forme des actions (`{ ok, … }`, ou `{ ok: false, error }` avec un
statut HTTP qui suit le code). L'app embarque le même moteur WebAssembly pour
jouer contre l'IA, et ouvre la WebSocket de `access.ws` pour une table en ligne.
Toute nouvelle action d'une page Jouer se branche aussi là.

## Scellé et draft

Le lobby demande d'abord un format : Construit, Scellé ou Draft. En limité,
`components/play/limited/LimitedSetup.tsx` choisit les boosters (`booster_sets()`
du moteur), le nombre de joueurs (2 à 8) et le niveau des IA, puis crée un
`LimitedEvent` dans le navigateur. La page `/games/riftbound/play/limited`
(`LimitedGame`) tient la suite :

| Phase du moteur | Écran |
|---|---|
| `draft` | `DraftScreen` : un paquet, une carte à prendre. |
| `build` | `SealedOpening` (scellé, tant que tous les boosters n'ont pas été regardés), puis `BuildScreen`. |
| `play`, `done` | Le match du joueur sur `GameTable` (`useSoloGame`), puis `LimitedResults`. |

- L'évènement est gardé dans `localStorage` (`joutes.play.limited`, forme
  `LimitedSave` de `lib/engine/limited.ts`) : le journal du moteur, le deck en
  cours et le journal du match. Recharger reprend où l'on en était.
- Le site ne juge pas le deck : `LimitedEvent.check` rend les problèmes, dans
  les mots du moteur, et « Construire pour moi » appelle `suggest`. Les calculs
  de `lib/engine/limited.ts` (réserve restante, domaines, courbe, répartition
  des runes) ne servent qu'à l'affichage et ont leurs tests.
- Pour commencer, un évènement se joue en un seul match d'une partie. Les
  matchs entre IA tournent dans `simulation.worker.ts` et leur résultat est
  inscrit par `report`.
- Les boosters de tous les joueurs sont ouverts dans le navigateur de celui qui
  joue : c'est sans enjeu contre des IA. En ligne, l'évènement vit sur le
  serveur de parties, qui seul voit toutes les cartes.

### En ligne et en mode hôte

À l'étape « Qui joue ? », `LimitedSetup` propose trois lieux : contre des IA
(ci-dessus), en ligne, ou « Mon serveur ».

- **En ligne.** `createLimitedEventAction` (réservée à `sub:play-host`, comme
  une table) ouvre une salle d'attente : collection `limitedEvents`
  (`lib/db/limited-events.ts`), règles dans `lib/engine/limited-events.ts`,
  page `/games/riftbound/play/limited/room?id=` (`LimitedRoom`). Rejoindre est
  libre ; l'hôte ajoute des IA et lance dès deux joueurs, les places libres
  restent vides. Au lancement, le site envoie les réglages et les délais à
  `POST /events` du serveur de parties, puis signe pour chacun un ticket dont
  le champ `game` vaut `event:<identifiant>`.
- **Mon serveur.** `LimitedHostPanel` crée l'évènement sur le serveur de
  l'organisateur depuis le navigateur et donne un lien par joueur, vers
  `/games/riftbound/play/limited/remote#server=…&ticket=…` (`RemoteLimited`).
- **La suite est commune** : `OnlineLimited` tient la connexion
  (`useOnlineLimitedEvent`, route `/events/{id}/ws`) et réemploie `DraftScreen`,
  `SealedOpening`, `BuildScreen` et `LimitedResults`. Le serveur n'envoie à
  chacun que son paquet, sa réserve et son deck ; il vérifie le deck (`check`),
  le construit sur demande (`suggest`), tient les délais (60 s par choix et
  20 min de construction par défaut, réglables par l'hôte, 0 pour aucun) et, à
  leur terme, choisit ou construit à la place du joueur. Pour les matchs il
  ouvre une table par paire et remet à chaque joueur le ticket de la sienne :
  la table est celle d'une partie en ligne (`useOnlineGame`).
- Le navigateur ne garde que le deck en chantier
  (`joutes.play.limited.online.<évènement>.<siège>`). Quitter avant la fin
  envoie `forfeit`. Un visiteur sans siège suit l'évènement en spectateur, sans
  voir aucune carte.

### Un jeu de plus en limité

Les écrans du limité ne connaissent aucun jeu : chacun reçoit un « kit »
(`LimitedKit`, `components/play/limited/kit.ts`). Le kit étend le profil du jeu
(`LimitedProfile`, `lib/engine/limited-profile.ts` : adresse des pages, clé de
sauvegarde, règles, moteur wasm) et y ajoute ce qui s'affiche : le visage des
cartes (`Faces`, `lib/engine/limited-faces.ts`), l'écran de construction, le
résumé du deck et la table du match, contre l'IA et en ligne.

| Jeu | Profil | Kit | Pages |
| --- | --- | --- | --- |
| Riftbound | `lib/engine/limited-riftbound.ts` | `components/play/limited/riftbound-kit.tsx` | `/games/riftbound/play/limited` |
| Star Wars: Unlimited | `lib/engine/swu/limited-profile.ts` | `components/play/swu/limited/swu-kit.tsx` | `/games/swu/play/limited` |
| Cyberpunk TCG | `lib/engine/cyberpunk/limited-profile.ts` | `components/play/cyberpunk/limited/cp-kit.tsx` | `/games/cp/play/limited` |

Côté serveur, `LIMITED_GAMES` (`lib/engine/limited.ts`) liste les jeux admis,
la table `GAMES` de `lib/engine/limited-events.ts` donne leurs règles, leurs
extensions et les noms de leurs IA, et chaque action de
`riftbound/play/limited/actions.ts` prend le jeu en premier paramètre.

Star Wars: Unlimited (règle 10 des Comprehensive Rules) : 6 boosters en scellé,
3 en draft ; le draft commence par les leaders (`view.prelude`, un leader par
choix, passés au joueur précédent), puis viennent les paquets. Le deck se
construit dans `SwuBuildScreen` : un leader de la réserve, une base ouverte ou
une base commune d'une extension ouverte, 30 cartes au moins. Une carte dont
les affinités ne viennent ni du leader ni de la base est atténuée et annonce son
surcoût (`swuAspectPenalty`, `lib/engine/swu/limited.ts`).

Cyberpunk TCG (Tournament Rules, annexe D.2.2) : scellé seulement, le jeu n'a
pas de draft, et contre des IA seulement, le site n'ayant pas de table en ligne
pour ce jeu (`game: null` dans le profil : `LimitedSetup` ne propose alors ni
salle d'attente ni mode hôte, et le kit n'a pas d'`OnlineMatch`). 6 boosters de
12 cartes ; le deck se construit dans `CpBuildScreen` : trois Légendes au plus,
de noms différents, 30 cartes au moins de trois couleurs au plus, sans limite de
RAM ni d'exemplaires. Une Légende qui manque devient, au premier tour, une Eddie
face cachée prise sur le deck : c'est le moteur qui le fait (`Config.limited`).
