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
| Mon serveur (mode hôte) | Sur un serveur lancé par un organisateur (`joutes-server host`) | L'adresse et le code du serveur, saisis dans la page. Joutes ne les voit pas. |

## Le moteur dans ce dépôt

- `lib/engine/pkg/` : le moteur compilé pour le navigateur, copié depuis
  `joutes-engine` (`scripts/build-wasm.sh`, dossier `pkg/web`). `VERSION` dit de
  quel commit. Pour le mettre à jour : reconstruire, recopier les quatre
  fichiers, mettre `VERSION` à jour.
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
font tourner le moteur dans le processus du site. La relecture d'une table en
ligne n'est ouverte qu'à ses joueurs, une fois la partie finie : le journal
montre les mains. `riftbound_judge_review` demande un compte, et ce que le
moteur rejoue est borné en taille.

## Limites connues

- Les textes du moteur (questions, journal) sont en français seulement.
- Le moteur joue les extensions OGN et OGS.
- Un choix de mode s'affiche « Option 1 / Option 2 » ; le texte de la carte est
  montré à côté.
- Depuis une page https, le navigateur refuse un serveur hôte sans chiffrement,
  sauf `localhost`.
