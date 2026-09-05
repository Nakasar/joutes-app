# Les liens d'un jeu, et les directs de son éditeur

Le site officiel et les réseaux de l'éditeur sur la fiche du jeu — et, pour sa
chaîne YouTube, un sondage horaire qui allume son direct sur Joutes dès qu'il
commence.

## Le principe

Deux fonctionnalités qui n'en font qu'une, parce que la seconde se sert de la
première :

1. **Les liens** se saisissent dans `/admin/games/<jeu>?tab=liens` et
   s'affichent en fin de fiche publique, sous « Suivre l'éditeur ».
2. **Le lien YouTube fait autre chose qu'ouvrir une page.** C'est la chaîne que
   le cron interroge chaque heure. Un direct qui démarre s'affiche en grand en
   tête de la fiche du jeu, et dans le bandeau des directs de l'accueil pour qui
   suit ce jeu. Il s'arrête, il disparaît.

Il n'y a donc **aucun réglage** pour les directs : coller l'adresse de la chaîne
*est* le réglage, la retirer arrête tout. C'est la même règle que la liste des
destinations d'une chaîne liée à un compte (`docs/STREAM_LINKING.md`).

## Où ça vit

| Fichier | Rôle |
| --- | --- |
| `lib/constants/game-links.ts` | **Pur.** La table des réseaux : clés, libellés, exemples |
| `lib/types/GameStream.ts` | Le modèle : chaîne suivie, vidéos surveillées, direct en cours |
| `lib/streams/youtube-channels.ts` | **Pur.** Lire une adresse de chaîne, et l'adresse de son flux |
| `lib/streams/youtube-api.ts` | `resolveYouTubeChannel`, `fetchYouTubeChannelFeed` — à côté du reste de l'API Data |
| `lib/streams/game-lives.ts` | La réconciliation : résoudre, lire les flux, allumer, éteindre |
| `lib/db/game-streams.ts` | La collection `game_streams`, ses index, ses écritures |
| `lib/schemas/game.schema.ts` | `gameLinksSchema` — la validation du formulaire |
| `app/api/cron/game-lives/route.ts` | Le tour d'horloge |
| `app/[locale]/(app)/admin/games/[gameSlug]/GameLinksForm.tsx` | L'onglet « Liens et réseaux » |
| `app/[locale]/(app)/games/[gameSlugOrId]/GamePublisherLinks.tsx` | Les liens sur la fiche publique |
| `app/[locale]/(app)/games/[gameSlugOrId]/GameLiveSection.tsx` | Le direct, en grand, en tête de fiche |
| `app/[locale]/(app)/_accueil/BandeauDirects.tsx` | Le bandeau de l'accueil, lieux et jeux mêlés |
| `scripts/db/seed-game-links.ts` | Les liens déjà connus, posés sans ressaisie |

## Pourquoi un sondage, et pas le hub

YouTube a bien un hub WebSub, et Joutes s'en sert déjà — pour les chaînes que
**leur propriétaire** a liées à son compte. Le réutiliser ici coûterait un
abonnement à renouveler tous les cinq jours par chaîne, une route à sécuriser et
un bail à réparer. Pour gagner quoi ?

Rien. `docs/STREAM_LINKING.md` le note déjà : le hub ne dit pas « direct », il
dit « quelque chose a été publié » ; il ne pousse rien au démarrage réel d'un
direct programmé, ni à sa fin. **Pour YouTube, le cron est déjà le mécanisme** —
le hub n'est qu'une façon d'apprendre les identifiants de vidéos un peu plus
tôt. Ici, on les lit soi-même dans le flux public, et il ne reste que le cron.

## Ce que coûte un tour

Deux lectures par chaîne, dont une seule est facturée :

| Appel | Quota | Ce qu'il apprend |
| --- | --- | --- |
| Flux Atom public de la chaîne | **0** | Les quinze dernières publications |
| `videos.list` | **1 par lot de 50 identifiants** | Lesquelles sont en direct |

Le second est fait **une fois pour tout le catalogue** : un seul appel couvre
tous les jeux. Soit environ **24 unités par jour** pour l'ensemble du site,
contre 10 000 disponibles.

`search.list`, qui répondrait pourtant directement « cette chaîne
diffuse-t-elle ? », en coûterait **100 par chaîne et par tour** — 4 800 par jour
pour deux jeux, 24 000 pour dix. Elle est délibérément absente, ici comme dans
`lib/streams/youtube-api.ts`.

La résolution d'une adresse (`@riftbound` → `UC…`) coûte une unité de plus, mais
**une seule fois par chaîne** : le résultat est rangé sur le document et n'est
redemandé que si l'administration change le lien.

### La limite connue

Un direct doit apparaître dans le flux de sa chaîne pour être vu. C'est le cas
d'un direct programmé, publié à sa création — et c'est déjà ce sur quoi repose
toute la surveillance des chaînes liées. Un direct démarré sans aucune annonce
préalable peut n'y entrer qu'avec quelques minutes de retard ; le tour suivant le
rattrape. La granularité est de toute façon l'heure.

## Pourquoi une collection à part

Le direct d'un éditeur pourrait tenir dans le document du jeu. Il n'y tient pas,
et c'est délibéré : **les jeux sont lus en cache**. `lib/db/games-cached.ts`
sert le catalogue avec `cacheLife("days")`, invalidé par étiquette à chaque
édition d'administration. Y écrire un état qui change toutes les heures
reviendrait à jeter le cache du catalogue entier chaque heure, pour un champ que
trois écrans regardent.

`game_streams` se lit fraîche, et le catalogue reste froid.

C'est aussi pourquoi le cron lit `getAllGames()` et non `readAllGames()` : un
cron qui lirait le catalogue en cache se verrait servir celui d'hier sans jamais
le savoir.

## Deux jeux d'adresses qui ne se ressemblent pas

`readYouTubeChannelRef` (pur, testé) reconnaît les quatre formes qu'un humain a
sous la main :

| Adresse | Résolue par |
| --- | --- |
| `youtube.com/@riftbound` | `channels.list?forHandle=` |
| `youtube.com/channel/UC…` | Rien — l'identifiant est déjà là |
| `youtube.com/user/nom` | `channels.list?forUsername=` |
| `youtube.com/c/nom` | Lue comme un handle, faute de mieux côté API |

Tout le reste — une vidéo, une playlist, un autre site — est **refusé** plutôt
que deviné, et le formulaire d'administration le dit à la saisie : le lien
s'affichera, mais aucun direct ne sera détecté. Inventer une chaîne à partir
d'une vidéo demanderait un appel de plus pour un résultat que personne n'a
demandé.

## Ce que le bandeau de l'accueil montre

| Qui regarde | Directs de lieux | Directs de jeux |
| --- | --- | --- |
| Connecté, avec des lieux suivis | ses lieux | les jeux qu'il suit |
| Connecté, sans lieu suivi | les lieux autour | les jeux qu'il suit |
| Visiteur | les lieux autour | tous |

Un visiteur n'a rien à personnaliser, et les directs d'éditeurs sont publics et
peu nombreux : il les voit tous, comme il voit les lieux autour de lui faute de
lieux suivis. Les directs de jeux passent **en tête** — ils sont rares, et un
direct d'éditeur relégué sous trois boutiques ne serait jamais vu.

Le titre du bandeau nomme la source, et ne peut donc le faire que si elle est
unique : dès qu'un direct d'éditeur s'y mêle, ni « dans vos lieux » ni « autour
de vous » n'est vrai, et le titre devient neutre plutôt que faux.

## Configuration

Rien n'est obligatoire. Sans `YOUTUBE_API_KEY`, les liens s'affichent, l'onglet
d'administration fonctionne, et le cron ne fait rien — le site fonctionne,
la détection dort.

| Variable | Sans elle |
| --- | --- |
| `YOUTUBE_API_KEY` | Aucun direct n'est détecté (`youtubeConfig()` rend `null`) |
| `CRON_SECRET` | Le cron refuse tout |

Le cron est déclaré dans `vercel.json` :

```json
{ "path": "/api/cron/game-lives", "schedule": "0 * * * *" }
```

Séparé de `streams-refresh`, qui tourne toutes les cinq minutes pour les chaînes
liées à un compte. Les fondre ferait payer douze fois par heure un sondage dont
personne n'attend cette fraîcheur — et un quota épuisé d'un côté éteindrait les
directs de l'autre.

Contrairement aux chaînes liées, **rien ici n'exige une adresse publique en
`https`** : aucun abonnement n'est posé chez YouTube, donc aucun risque qu'un
déploiement d'aperçu détourne les livraisons de la production. Le cron se teste
donc en local sans tunnel :

```sh
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/game-lives
```

Il rend son compte rendu : `channels`, `resolved`, `started`, `stopped`,
`removed`, `failed`.

## Index MongoDB

`scripts/db/ensure-indexes.ts` les pose, et il est idempotent :

```sh
node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
  scripts/db/ensure-indexes.ts
```

Sur `game_streams` :

| Index | À quoi il sert |
| --- | --- |
| `{ gameId: 1, platform: 1 }` **unique** | Un jeu ne suit qu'une chaîne par plateforme |
| `{ live: 1 }` | Les vitrines ne veulent que ce qui diffuse |

L'unicité est une **règle**, pas une optimisation : c'est la clé sur laquelle le
cron fait son `upsert`, et sans elle deux tours qui se chevauchent créeraient
deux documents pour la même chaîne — donc deux directs sur la même fiche.

## Mettre au point en local

- **Les modules purs**, avec `npm run test` : lecture d'une adresse de chaîne,
  adresse du flux.
- **Le cron entier**, avec la commande `curl` ci-dessus : il n'a besoin d'aucun
  webhook, seulement d'une clé d'API et d'une base.

Pour voir un direct sans attendre qu'un éditeur en lance un, poser dans
`game_streams` un document dont `live.videoId` désigne un direct YouTube en
cours suffit — la fiche du jeu l'affiche au rechargement. Le tour de cron suivant
l'éteindra, ce qui est précisément ce qu'on veut vérifier.
