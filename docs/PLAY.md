# Jouer (table de jeu Riftbound)

Page `/games/riftbound/play`, ouverte par la fonctionnalité de jeu « Jouer »
(admin du jeu, onglet Fonctionnalités). Le moteur vient du dépôt
`joutes-engine` (Rust) : il connaît les règles, publie les actions permises et
raconte chaque évènement en citant la règle. Le site ne contient aucune règle.

## Les trois façons de jouer

| | Où tourne la partie | Ce qu'il faut |
|---|---|---|
| Contre l'IA | Dans le navigateur (WebAssembly) | Rien. La partie est gardée dans `localStorage` et reprend au rechargement. |
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

## En ligne

- Une table est un document `gameTables` (`lib/db/game-tables.ts`), dont le code
  sert de lien d'invitation. Règles dans `lib/engine/tables.ts`.
- Au lancement, le site envoie la configuration au serveur de parties
  (`POST /games`), puis signe un ticket par personne (`lib/engine/tickets.ts`,
  HMAC-SHA256, même format que `joutes-session`). Le navigateur ouvre la
  WebSocket du serveur avec ce ticket. Un visiteur reçoit un ticket de
  spectateur.
- À la fin, le serveur appelle `POST /api/engine/result`, signé avec le même
  secret.

## Arbitrage (MCP)

`riftbound_judge_simulate` et `riftbound_judge_review` (`app/mcp/tools-judge.ts`)
font tourner le moteur dans le processus du site. La relecture d'une table en
ligne n'est ouverte qu'à ses joueurs, une fois la partie finie : le journal
montre les mains.

## Limites connues

- Les textes du moteur (questions, journal) sont en français seulement.
- Le moteur joue les extensions OGN et OGS.
- Un choix de mode s'affiche « Option 1 / Option 2 » ; le texte de la carte est
  montré à côté.
- Depuis une page https, le navigateur refuse un serveur hôte sans chiffrement,
  sauf `localhost`.
