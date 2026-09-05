# Les réseaux d'un éditeur, sur la fiche de son jeu

Deux fois par jour, on sonde les comptes déclarés sur la fiche d'un jeu, et ses
dernières publications s'affichent en grille — chaque vignette portant le logo
de sa plateforme et le nom du compte qui l'a publiée.

## Le principe

Les liens de « Suivre l'éditeur » (`docs/GAME_LIVES.md`) sont des **portes de
sortie** : ils envoient le lecteur ailleurs et ne disent rien de ce que
l'éditeur raconte. Cette fonctionnalité renverse cela.

Deux réglages, et ils ne disent pas la même chose :

- **le fanion `socialFeed`** est l'*autorisation de republier* ;
- **les liens** de l'onglet « Liens et réseaux » sont les *sources*.

L'un sans l'autre ne fait rien. La séparation compte : un compte a toute sa
place dans « Suivre l'éditeur » sans qu'on veuille pour autant reprendre
automatiquement ce qu'il publie, et le jour où le compte d'un éditeur part en
vrille, on veut un interrupteur — pas un nettoyage de champ.

## Où ça vit

| Fichier | Rôle |
| --- | --- |
| `lib/social/platforms.ts` | **Pur.** La table des plateformes : libellé, lien lu, collectée ou non |
| `lib/social/instants.ts` | **Pur.** La normalisation des dates, sans laquelle le tri est faux |
| `lib/social/bluesky-actors.ts` | **Pur.** Lire une adresse de compte, bâtir profils et permaliens |
| `lib/social/bluesky-feed.ts` | **Pur.** La réponse de l'AppView, ramenée à des publications |
| `lib/social/youtube-posts.ts` | **Pur.** Le tri vidéos / shorts, et le rejet des directs |
| `lib/social/bluesky-api.ts` | L'unique requête réseau côté Bluesky |
| `lib/social/game-social.ts` | L'orchestrateur : ménage, deux passes, rétention |
| `lib/types/GameSocialPost.ts` | Le modèle |
| `lib/db/game-social-posts.ts` | La collection `game_social_posts`, ses index, ses écritures |
| `app/api/cron/game-social/route.ts` | Le tour, à 1 h et 13 h |
| `app/[locale]/(app)/games/[gameSlugOrId]/GameSocialSection.tsx` | La section de la fiche |
| `app/[locale]/(app)/games/[gameSlugOrId]/social/` | La page dédiée, la vignette, le masquage |
| `components/brand/BrandMarks.tsx` | Les marques que `lucide-react` ne porte pas |

## Ce à quoi on a réellement accès

Vérifié le 2026-09-05, et c'est ce qui décide du périmètre.

| Plateforme | Lecture d'un compte tiers | Verdict |
| --- | --- | --- |
| **Bluesky** | `public.api.bsky.app`, sans clé ni compte | collectée |
| **YouTube** | flux Atom (0 quota) + `videos.list` (1 unité / 50 identifiants) | collectée |
| **X** | plus aucun accès gratuit depuis février 2026 ; $0,005 par post lu | déclarée, non collectée |
| **Instagram** | pas d'API publique. `business_discovery` lirait un compte Business tiers, mais exige que **Joutes** possède son propre compte Instagram Business, une page Facebook liée, et une app Meta validée en App Review | déclarée, non collectée |

Les deux dernières sont bloquées sur des **démarches**, pas sur du code. Elles
figurent dans `SOCIAL_PLATFORMS` avec `collectable: false`, et l'onglet
d'administration le dit sous leur champ. Les ajouter un jour, c'est : cette
ligne qui passe à `true`, un module pur de normalisation, un module réseau, une
passe de plus dans l'orchestrateur. On n'écrit pas d'avance un client qui n'aura
jamais tourné contre l'API qu'il prétend parler.

## Pourquoi il n'y a pas de registre de collecteurs

C'est le choix de structure le plus contre-intuitif du dossier, et il vaut d'être
justifié : une interface `collect(compte)` supposerait que les plateformes se
sondent de la même façon. Elles ne s'y sondent pas.

- **Bluesky** : un aller-retour par compte, rien à résoudre, rien à mutualiser.
- **YouTube** : un flux gratuit par chaîne, **plus un unique `videos.list` pour
  tout le catalogue**. C'est ce lot partagé qui rend le quota tenable.

Un cadre commun devrait soit renoncer au lot — et payer une unité par chaîne au
lieu d'une pour tout le monde — soit se scinder en `gather()` puis `enrich()`,
un cadre inventé pour un seul cas. L'orchestration est donc écrite en clair,
comme celle de `refreshGameLives()`, et **le point d'extension est déclaratif** :
`lib/social/platforms.ts`.

## Ce que coûte un tour

| Appel | Quota |
| --- | --- |
| `getAuthorFeed` (Bluesky), un par compte | aucun, l'API est publique |
| Flux Atom d'une chaîne, un par chaîne | aucun |
| `videos.list`, **un pour tout le catalogue** | 1 unité par lot de 50 |

Soit **deux unités par jour** pour l'ensemble du site — et encore : on
n'interroge que les vidéos dont on ignore la durée, si bien que le régime
permanent tombe à presque rien. `search.list` reste bannie, ici comme dans
`lib/streams/youtube-api.ts`.

Le `channelId` d'une chaîne n'est pas re-résolu : `game_streams` le porte déjà,
tenu à jour toutes les heures par le cron des directs, avec la `sourceUrl` qui
dit si le lien a changé. On applique la même garde, et `resolveYouTubeChannel`
n'est appelée que dans l'heure qui suit une correction de lien.

## Les quatre pièges du modèle

Aucun n'est théorique ; chacun a son cas de test.

### 1. Un `rkey` Bluesky n'est pas une identité

C'est un identifiant unique **dans un dépôt**, pas dans le réseau : deux comptes
peuvent porter le même. `externalId` porte donc le compte —
`did:plc:xxx/3mup…` — sans quoi deux publications distinctes se recouvriraient.
Chez YouTube, le `videoId` est déjà global.

### 2. Un permalien bâti sur le handle casse

Un handle Bluesky est un nom de domaine vérifié, donc une chose qui change. Un
éditeur qui passe de `x.bsky.social` à `riftbound.gg` garde son DID et casse
tous les liens bâtis sur son handle. **Les permaliens se construisent sur le
DID**, que `bsky.app` accepte tout aussi bien ; le handle n'est écrit que sous
la vignette.

### 3. Le tri lexicographique sur des fuseaux mêlés

`publishedAt` **est** le tri de la grille, et MongoDB trie une chaîne
lexicographiquement — c'est-à-dire, pour une date ISO, sur l'heure *écrite* et
non sur l'instant. Tant que tout le monde écrit en UTC, les deux coïncident.
Dès qu'un décalage s'en mêle, ils divergent d'autant :

```
"2026-09-04T20:00:00+02:00"   →  18 h UTC
"2026-09-04T19:00:00Z"        →  19 h UTC, donc plus tard
```

La comparaison de chaînes range la première **après** la seconde. Rien ne plante,
rien ne se voit dans un test qui ne mêle qu'une source : l'ordre de toute la
grille est simplement faux. D'où `normalizeInstant`, par où **rien n'entre en
base sans passer**.

### 4. `record.createdAt` n'est pas vérifié

Sur Bluesky, il est écrit par l'application qui poste. Une publication datée de
2030 — bug de client, horloge décalée, ou malice — s'épinglerait en tête de la
grille pour toujours, et la rétention ne l'évincerait jamais puisqu'elle
resterait la « plus récente ». D'où
`publishedAt = min(record.createdAt, indexedAt)`, le second étant posé par le
serveur.

## Ce qu'on écarte, et pourquoi

| Écarté | Raison |
| --- | --- |
| **Les reposts Bluesky** | Voir ci-dessous |
| **Les réponses** (`record.reply`) | `filter=posts_no_replies` les retire aujourd'hui, mais cette sémantique a déjà changé. On revérifie |
| **Les publications étiquetées** (`porn`, `graphic-media`, `!hide`…) | Publication automatique sur une fiche que des mineurs lisent. **Seul filtre qui protège d'autre chose que d'une gêne** |
| **Les directs YouTube** (`live`, `upcoming`) | Le flux d'une chaîne les contient, et un direct ferait doublon avec `GameLiveSection`, en grand juste au-dessus. Le tour suivant le reprendra en `none`, avec sa vraie durée |
| **Ce qu'on ne sait pas dater** | On ne sait pas le ranger, et le tri est tout ce qui fait la grille |

Les **citations** sont gardées (`app.bsky.embed.record#view`) : c'est bien
l'éditeur qui écrit. On ne rend simplement pas la carte citée.

### Les reposts, en détail

Aucune valeur de `filter` ne les écarte — mesuré : `posts_no_replies` en rend
sept sur vingt, et un nom de filtre inventé ne lève même pas d'erreur, l'API
retombe en silence sur son défaut. Le tri se fait donc chez nous, sur la
présence de `reason`. Quatre raisons :

1. **La promesse.** La vignette porte le nom du compte de l'éditeur. Un repost
   fait porter ce nom à un contenu tiers qu'il n'a pas écrit et que nous ne
   pouvons pas modérer à la source.
2. **La clé d'unicité.** L'`externalId` d'un repost est celui de l'original :
   deux comptes qui repostent la même chose donnent le même document avec deux
   comptes créditeurs.
3. **La date.** Il faudrait trier sur `reason.indexedAt` et non sur
   `record.createdAt`, soit deux sémantiques de date dans une même collection.
4. **La place.** Douze vignettes sur la fiche ; un éditeur actif en remplirait
   la moitié.

C'est réversible à peu de frais : le rejet est une ligne du normalisateur pur,
avec son commentaire et son cas de test.

## Short ou vidéo

`videos.list?part=…,contentDetails` → `contentDetails.duration`, seuil à 180 s.

L'argument n'est pas « officiel contre non documenté » : le quota de
`videos.list` est d'**une unité par appel quel que soit le nombre de `part`**,
donc ajouter `contentDetails` à l'appel qui a déjà lieu coûte **zéro unité et
zéro aller-retour**. Les flux non documentés `UULF…` / `UUSH…` feraient le tri à
la source mais coûteraient deux requêtes de plus par chaîne, sur des
identifiants que Google n'a jamais publiés.

**L'approximation est assumée** : la durée dit « format court », pas « ceci est
un Short ». Une vidéo classique de quatre-vingt-dix secondes sera classée
`short`. Et **une durée inconnue vaut `video`, jamais `short`** — se tromper
vers la vidéo est le sens qui ne surprend personne.

## La rétention, et la pierre tombale

Un jeu garde **cent publications**, toutes plateformes mêlées. La purge est le
calque de `recordActivity` (`lib/db/tournaments.ts`) : un `find` projeté, trié,
sauté de cent, puis un `deleteMany`.

> **Contrainte à respecter en changeant une limite de collecte :** la somme de
> ce qu'un tour peut moissonner pour un jeu doit rester très inférieure à
> `GAME_SOCIAL_KEEP`. Aujourd'hui cinquante chez Bluesky et quinze dans le flux
> Atom, soit soixante-cinq pour cent. Monter Bluesky à cent ferait purger à
> chaque tour ce que le suivant recollecterait, et la base tournerait en rond
> deux fois par jour.

**`hiddenAt` fait du document une pierre tombale.** Son contenu ne sert plus à
personne ; sa seule fonction est d'occuper la clé unique pour que la collecte ne
puisse pas ressusciter la publication. Trois garanties, qui tiennent ensemble :

1. **L'upsert n'écrit jamais `hiddenAt`**, ni en `$set` ni en `$setOnInsert`.
   Toute ligne ajoutée un jour au `$set` doit être pesée à cette aune.
2. **La purge ne voit que les non-masquées** (`{ hiddenAt: null }`, et non
   `$exists: false`, qui ne se sert pas de l'index de la même façon).
3. **Le ménage ne supprime jamais une masquée.**

Un lien effacé puis remis, un fanion éteint puis rallumé, un compte changé puis
rétabli : dans les trois cas la publication reste masquée. La seule façon de la
faire réapparaître est de la démasquer.

## Le ménage se fait en deux fois

`refreshGameLives` fait tout le sien avant le réseau. Ici, seul le ménage **sûr**
passe avant — ce dont plus aucune fiche ne parle, information qui vient de notre
base et ne peut pas être fausse. Celui qui dépend de ce qu'une plateforme a
répondu passe **après**, et ne s'applique qu'aux comptes qu'on a effectivement su
lire.

La raison : effacer l'historique d'un jeu parce que l'AppView a rendu un 502
pendant deux secondes coûterait bien plus que d'afficher douze heures de plus la
publication d'un compte qui vient de changer. Un direct périmé ment ; une
publication de la veille, non.

C'est aussi pourquoi `fetchBlueskyAuthorFeed` rend `null` et non `[]` quand elle
échoue : « on n'a pas su lire » et « ce compte n'a rien publié » n'autorisent pas
les mêmes gestes.

## Le rendu

**La section** est en fin de fiche, après les actualités et avant l'agenda : les
actualités sont la voix éditoriale de Joutes, les réseaux la voix brute de
l'éditeur, et les deux répondent à « quoi de neuf ». Douze vignettes sur quatre
colonnes, puis « voir tout ».

**La page dédiée** `/games/<jeu>/social` montre les cent. **Sans pagination**, et
c'est à assumer : la rétention *est* la page.

**Les images tierces** se rendent en balise `<img>` nue — `next.config.ts` ne
déclare que l'hôte Vercel Blob pour l'optimiseur — filtrées par `externalUrl`
**au rendu**, avec `loading="lazy"` et `referrerPolicy="no-referrer"` : inutile
d'annoncer à `cdn.bsky.app` quelle fiche de jeu on lit. Le jour où une CSP
arrive, `cdn.bsky.app` et `i.ytimg.com` devront y figurer.

**Le texte est du contenu tiers** : rendu en texte brut, jamais en HTML, et
tronqué à 400 caractères dès la collecte. Les `facets` de Bluesky ne sont pas
interprétées — le texte porte donc les URL crues et les mentions non liées, ce
qui est acceptable pour un extrait dont le lien mène au message entier.

### Les logos

`components/brand/BrandMarks.tsx` porte les marques que `lucide-react` n'a pas
(Bluesky, X, TikTok, Mastodon, Reddit), et `SocialLinkIcon` bascule dessus
**partout** — grille, fiche du jeu, profils des membres.

Le remplacement est global et non réservé à la grille, délibérément : deux
marques différentes pour un même compte sur un même écran — un papillon dans la
grille, une arobase trois cents pixels plus bas sous « Suivre l'éditeur » —
serait pire que l'une ou l'autre appliquée partout.

### Le masquage

Sur la **page dédiée seulement**. La fiche est le chemin le plus fréquenté du
site : y lire la session pour douze vignettes l'alourdirait pour un geste
mensuel. Et la modération se fait mieux devant cent vignettes que devant douze.

Un administrateur y voit les masquées, grisées, avec un « Réafficher » — sans
quoi le masquage serait irréversible faute de savoir ce qu'on a masqué. Le droit
(`checkAdmin`) est lu **une fois pour la grille**, pas par vignette.

## Configuration

Rien n'est obligatoire, et Bluesky ne demande **aucune** configuration : l'API
est publique.

| Variable | Sans elle |
| --- | --- |
| `YOUTUBE_API_KEY` | Bluesky est collecté, YouTube non |
| `CRON_SECRET` | Le cron refuse tout |

`YOUTUBE_WEBSUB_SECRET` n'y figure pas : `youtubeApiKey()` a été séparé de
`youtubeConfig()` pour cela — voir `docs/GAME_LIVES.md`, dont le cron souffrait
du même couplage.

Le cron est déclaré dans `vercel.json` :

```json
{ "path": "/api/cron/game-social", "schedule": "0 1,13 * * *" }
```

Séparé de `game-lives`, qui tourne toutes les heures. Les deux lisent la même
chaîne YouTube mais ne cherchent pas la même chose : un direct commencé il y a
cinquante minutes n'intéresse plus personne, une publication de ce matin si. Les
fondre ferait sonder vingt-quatre fois par jour des comptes qui publient deux
fois par semaine — et un quota épuisé d'un côté éteindrait l'autre.

À noter : trois crons se déclenchent à 01:00 (`update-discord-boards`,
`game-lives`, celui-ci). Vercel les lance en parallèle et ils partagent le quota
YouTube. Négligeable aux ordres de grandeur en cause.

## Index MongoDB

`scripts/db/ensure-indexes.ts` les pose, et il est idempotent :

```sh
node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
  scripts/db/ensure-indexes.ts
```

Sur `game_social_posts` :

| Index | À quoi il sert |
| --- | --- |
| `{ gameId: 1, platform: 1, externalId: 1 }` **unique** | Une publication n'existe qu'une fois par jeu |
| `{ gameId: 1, hiddenAt: 1, publishedAt: -1 }` | La lecture des vitrines et le tri de la purge |

L'unicité est une **règle**, pas une optimisation : c'est la clé de l'upsert, et
sans elle deux tours qui se chevauchent doubleraient la grille — et le masquage
ne tiendrait plus, puisque la collecte créerait un document neuf à côté de la
pierre tombale.

## Mettre au point en local

- **Les modules purs**, avec `npm run test` : cinq modules, dont la lecture d'un
  flux Bluesky réel (`lib/social/__fixtures__/bluesky-author-feed.json`).
- **Le cron entier**, qui n'a besoin d'aucun webhook :

  ```sh
  curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/game-social
  ```

  Le compte rendu doit dire des chiffres plausibles. **Rejouez-le : le second
  tour doit rendre `inserted: 0`.** C'est le test d'idempotence, et il vaut
  mieux qu'un test unitaire.

- **Le masquage, bout en bout**, et c'est le seul comportement du dossier qu'un
  contresens rendrait invisible jusqu'à l'incident : masquer une vignette,
  rejouer le cron, recharger — elle reste masquée. Puis effacer le lien de la
  fiche, rejouer, remettre le lien, rejouer — elle est *toujours* masquée.

Un jeu se prépare en deux gestes depuis `/admin/games/<jeu>` : cocher « Réseaux
de l'éditeur » dans « Fonctionnalités », et coller au moins une adresse Bluesky
ou YouTube dans « Liens et réseaux ».
