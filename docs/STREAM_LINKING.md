# Directs Twitch et YouTube

Lier sa chaîne à son compte Joutes, s'en servir pour se connecter, et laisser
ses directs s'annoncer tout seuls sur les vitrines qu'on a choisies.

> Ce document ne parle que des chaînes **liées à un compte**. Les chaînes des
> **éditeurs**, suivies depuis la fiche de leur jeu, n'ont ni liaison ni OAuth
> et ne passent pas par le hub : voir [GAME_LIVES.md](GAME_LIVES.md) pour leurs
> directs, [GAME_SOCIAL.md](GAME_SOCIAL.md) pour leurs publications.

## Le principe

Une chaîne ne prouve rien sur l'identité de son propriétaire. C'est pourquoi
tout part de la **liaison**, faite depuis une session déjà ouverte, sur
« Connexions et comptes » (`/account/security`) :

1. **On lie** son compte Twitch ou YouTube à son compte Joutes.
2. **On peut alors s'y connecter**, exactement comme avec Discord — mais
   seulement une fois lié. `disableSignUp` est posé sur les deux fournisseurs :
   un compte inconnu qui tente Twitch est refusé, avec un message qui dit quoi
   faire plutôt que « échec de connexion ».
3. **On choisit où le direct s'annonce** : ses lieux, ses groupes de jeu. Cette
   liste *est* le réglage — il n'y a ni interrupteur ni bouton « démarrer ».
   Retirer la dernière destination arrête tout.

Ensuite, plus rien à faire. Le direct démarre sur la plateforme, il apparaît sur
les vitrines ; il s'arrête, il disparaît.

### Un lieu, un direct ; un groupe, trois

L'asymétrie n'est pas la nôtre, elle vient des deux vitrines qui existaient déjà
(`docs/PRIVATE_LAIRS.md`, la vitrine de groupe). Un lieu n'affiche qu'un direct,
et celui qui arrive **remplace** le précédent. Un groupe en affiche jusqu'à
trois, un par membre — `setPlayGroupLiveStream` remplace déjà celui du membre de
son côté. `lib/streams/announce.ts` absorbe la différence ; rien d'autre ne la
connaît.

## Où ça vit

| Fichier | Rôle |
| --- | --- |
| `lib/types/StreamLink.ts` | Le modèle : liaison, destinations, abonnement, direct en cours |
| `lib/streams/targets.ts` | **Pur.** Les règles de la liste de destinations |
| `lib/streams/twitch-eventsub.ts` | **Pur.** Signature HMAC-SHA256, fenêtre de rejeu, lecture des notifications |
| `lib/streams/youtube-websub.ts` | **Pur.** Signature du hub, flux Atom, vidéos surveillées |
| `lib/streams/config.ts` | Les secrets, lus en un seul endroit |
| `lib/streams/twitch-api.ts` | Helix : jeton applicatif, EventSub, `/streams` |
| `lib/streams/youtube-api.ts` | API Data v3 et hub WebSub |
| `lib/streams/identity.ts` | Du compte social lié à la chaîne qu'il désigne |
| `lib/streams/announce.ts` | Poser et retirer un direct sur les destinations |
| `lib/streams/subscriptions.ts` | L'écoute suit les destinations |
| `lib/streams/account-view.ts` | Ce que l'écran de compte a besoin de savoir |
| `lib/db/stream-links.ts` | La collection `stream_links`, ses index, ses écritures |
| `app/api/streams/twitch/route.ts` | Réception des livraisons EventSub |
| `app/api/streams/youtube/route.ts` | Vérification du hub et réception du flux Atom |
| `app/api/cron/streams-refresh/route.ts` | Le filet, toutes les cinq minutes |
| `app/[locale]/(app)/account/security/` | L'écran : cartes Twitch et YouTube |

## Les deux plateformes ne se ressemblent pas

C'est le fait central du dossier, et il explique presque tous les choix.

### Twitch — EventSub, et un filet

Twitch a exactement ce qu'il faut : deux abonnements webhook, `stream.online` et
`stream.offline`, posés par paire sur chaque chaîne liée. Ils ne se posent que si
la liaison a au moins une destination — Twitch plafonne leur nombre par
application, et une chaîne sans destination n'aurait rien à annoncer.

Trois règles gouvernent la route :

- **Le corps est lu brut.** `await req.text()`, jamais `req.json()` : la
  signature porte sur les octets reçus, précédés de l'identifiant du message et
  de son horodatage. Un test de non-régression vérifie qu'un corps re-sérialisé
  donne bien une empreinte différente — l'erreur que fait `app/discord/route.ts`.
- **Le défi ressort en texte brut.** Twitch envoie une vérification à la création
  de chaque abonnement et attend le `challenge` nu. Une réponse
  `application/json` échoue *silencieusement* : l'abonnement reste « en attente »
  pour toujours.
- **On répond 2xx dès que la livraison est authentique.** Twitch **révoque** un
  abonnement après plusieurs échecs consécutifs. Répondre 500 parce qu'une chaîne
  n'est plus liée chez nous ferait perdre l'écoute de tout le monde.

Le filet reste nécessaire : une livraison peut se perdre pendant un déploiement,
et un `stream.offline` manqué laisserait un direct affiché indéfiniment. Le cron
demande à Helix qui diffuse — cent chaînes par appel — et fait converger dans les
deux sens.

### YouTube — le cron *est* le mécanisme

YouTube n'a pas d'équivalent. Ce qu'il offre est un hub WebSub qui pousse un flux
Atom à chaque publication d'une chaîne, avec trois manques :

1. **Il ne dit pas « direct »**, il dit « quelque chose a été publié ». C'est
   `videos.list` qui tranche.
2. **Rien n'est poussé au démarrage réel d'un direct programmé** — l'entrée Atom
   arrive à sa *création*, parfois des jours avant — **ni à sa fin**.
3. **Le bail expire** au bout de cinq jours.

D'où la mécanique : chaque vidéo signalée par le hub entre dans une liste de
**vidéos surveillées** portée par la liaison, et le cron interroge leur état.
C'est lui qui allume les directs programmés, lui qui les éteint, lui qui
renouvelle le bail.

Le coût est ce qui rend l'affaire tenable. `videos.list` coûte **une unité de
quota par lot de cinquante identifiants**, contre cent unités pour `search.list`
qui répondrait pourtant directement « cette chaîne diffuse-t-elle ? ». À cent
unités l'appel, le quota quotidien par défaut autorise cent appels — pour tout le
site. `search.list` est donc délibérément absente.

Un compte Google sans chaîne YouTube existe : c'est un refus normal, que l'écran
de compte affiche en clair (« Aucune chaîne n'a pu être lue sur ce compte »).

## L'écoute suit les destinations

Une phrase, et c'est toute la règle de `lib/streams/subscriptions.ts` :

> Au moins une destination, une écoute. Plus aucune, plus d'écoute.

`syncSubscription` la porte et est appelée après chaque modification et à chaque
tour du cron. Elle est idempotente : une liaison en règle n'entraîne aucun appel
réseau, ce qui permet de l'appeler sans réfléchir.

Retirer la dernière destination **éteint d'abord ce qui est affiché**, puis
désabonne. L'inverse laisserait un direct sur une vitrine que plus rien ne
viendrait rafraîchir.

## Les droits se vérifient deux fois

À l'ajout d'une destination, et **encore** au moment d'annoncer. Entre les deux,
un lieu peut changer de mains et un membre quitter un groupe. Une destination
devenue interdite est sautée en silence — ce n'est pas une erreur de la
plateforme, c'est une situation qui a changé.

Le retrait, lui, ne vérifie rien : on retire toujours *sa propre* liaison, et une
destination dont on a perdu la propriété est précisément celle qu'il faut pouvoir
enlever.

## On ne défait que ce qu'on a fait

La fin d'un direct relit `live.announcements` — ce qui a **réellement** été
écrit — plutôt que les destinations du moment, qui ont pu changer entre-temps. Et
sur un lieu, elle ne retire le direct que si son URL est encore la nôtre : un
gérant qui a collé un autre lien à la main garde le sien.

## Configuration

Rien n'est obligatoire. Sans secrets, la liaison s'affiche désactivée, le bouton
de connexion correspondant disparaît de `/login`, les webhooks répondent 503 et
le cron ne fait rien — le site fonctionne, l'annonce dort.

| Variable | Sans elle |
| --- | --- |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | Pas de liaison ni de connexion Twitch |
| `TWITCH_EVENTSUB_SECRET` | Liaison et connexion fonctionnent, l'annonce automatique dort |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Pas de liaison ni de connexion YouTube |
| `YOUTUBE_API_KEY` / `YOUTUBE_WEBSUB_SECRET` | Idem, côté YouTube |
| `NEXT_PUBLIC_BASE_URL` en `https` | **Aucun abonnement n'est posé** (voir ci-dessous) |
| `CRON_SECRET` | Le cron refuse tout |

### Pourquoi l'adresse doit être celle de la production

Les deux abonnements sont posés **chez la plateforme** avec l'adresse de rappel,
et ni Twitch ni Google ne retiennent plus d'une adresse par abonnement. Un
déploiement d'aperçu qui s'abonnerait **détournerait les livraisons de la
production**. `streamCallbackBaseUrl()` refuse donc tout ce qui n'est pas une
adresse `https` explicite — une adresse `localhost` est de toute façon rejetée
par les deux hubs.

### Côté plateformes

- **Twitch** — une application sur <https://dev.twitch.tv/console/apps>, adresse
  de redirection OAuth `<BASE_URL>/api/auth/callback/twitch`. Rien à déclarer
  pour EventSub : les abonnements se créent par l'API, avec l'adresse de rappel
  `<BASE_URL>/api/streams/twitch`.
- **YouTube** — des identifiants OAuth sur
  <https://console.cloud.google.com>, adresse de redirection
  `<BASE_URL>/api/auth/callback/google`, plus une clé d'API Data v3 du même
  projet. Le périmètre demandé est `youtube.readonly`, et il ne sert qu'à une
  question posée une fois à la liaison : « quelle chaîne appartient à ce
  compte ? ». Tout le reste passe ensuite par des données publiques.

## Index MongoDB

`scripts/db/ensure-indexes.ts` les pose. Il est idempotent — le rejouer ne coûte
rien :

```sh
node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
  scripts/db/ensure-indexes.ts
```

Les deux drapeaux ne sont pas décoratifs. `--conditions=react-server` fait
résoudre `server-only` vers son module vide, sans quoi l'import de
`lib/mongodb.ts` échoue hors du serveur Next ; `--import` installe la résolution
de l'alias `@/`. Le typage est retiré nativement depuis Node 22.18 — pas
d'exécuteur TypeScript à installer.

Ce qu'il crée, sur `stream_links` :

| Index | À quoi il sert |
| --- | --- |
| `{ userId: 1, platform: 1 }` **unique** | Une liaison par compte et par plateforme |
| `{ platform: 1, channelId: 1 }` **unique** | Le chemin des webhooks, qui n'apprennent qu'une plateforme et une chaîne |
| `{ "subscription.expiresAt": 1 }` | Le renouvellement des baux WebSub |

Les deux unicités sont des **règles**, pas des optimisations : une personne ne
lie qu'une chaîne par plateforme, et une chaîne n'appartient qu'à un compte —
sans quoi un même direct s'annoncerait chez deux personnes. MongoDB refuse de
créer un index unique sur des doublons existants ; c'est le comportement voulu,
et le message d'erreur nomme alors la clé fautive.

## Mettre au point en local

Les webhooks exigent une adresse publique en `https`. Sans tunnel, deux choses
restent testables :

- **Les modules purs**, avec `npm run test` : signature Twitch et fenêtre de
  rejeu, signature du hub, lecture du flux Atom, règles de la liste de
  destinations.
- **Le cron**, qui n'a besoin d'aucun webhook pour YouTube :

  ```sh
  curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/streams-refresh
  ```

Pour signer une fausse livraison Twitch comme elle le ferait :

```ts
import { twitchSignature } from "@/lib/streams/twitch-eventsub";

const messageId = crypto.randomUUID();
const timestamp = new Date().toISOString();
const signature = twitchSignature({ messageId, timestamp, rawBody, secret });
```

L'horodatage doit être récent : au-delà de dix minutes, la livraison est refusée.
