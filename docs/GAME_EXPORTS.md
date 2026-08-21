# Documents d'export d'un jeu

`GET /api/games/{idOuSlug}/exports` sert le document hors ligne d'un jeu :
cartes, erratas, policies et règles réunis dans un JSON hébergé sur Vercel
Blob. La route ne renvoie jamais le document lui-même, seulement un pointeur
(`url`, `size`, `generatedAt`) ; c'est le client qui le télécharge, hors de
l'API. Le document est régénéré au plus une fois par 24 h.

## Génération en flux

Un document n'est jamais assemblé en mémoire. Les cartes sortent d'un curseur
Mongo et repartent aussitôt dans le flux d'envoi, fragment par fragment
(`lib/games/export-document.ts`), avec attente de la contre-pression entre deux
écritures.

C'est ce qui rend la route indifférente à la taille du catalogue. Mesures sur
des cartes réelles (~640 octets de JSON par carte, relevés sur le jeu de données
Riftbound du dépôt), pic de mémoire résidente du processus :

| Cartes | Document | Avant (tout en mémoire) | En flux |
| ---: | ---: | ---: | ---: |
| 1 180 | 1 Mo | 81 Mo | 77 Mo |
| 100 000 | 55 Mo | 338 Mo | 84 Mo |
| 300 000 | 164 Mo | 831 Mo | 98 Mo |
| 1 000 000 | 548 Mo | `RangeError: Invalid string length` | 97 Mo |

L'ancienne version matérialisait trois fois le même contenu — les objets JS du
`toArray()`, la chaîne UTF-16 du `JSON.stringify` (deux octets par caractère) et
le tampon d'octets de l'envoi — tous vivants en même temps, soit environ six
fois le poids du fichier produit. Au-delà d'environ 800 000 cartes elle
n'atteignait même plus la limite mémoire : `JSON.stringify` cassait d'abord sur
le plafond de longueur de chaîne de V8 (~512 M caractères).

La taille enregistrée (`size`) est le compte des octets réellement écrits, et
non plus un `Buffer.byteLength` sur le document entier.

## Les prix suivent les cartes

Chaque carte cotée porte son `marketPrice` — montant de référence, devise, place
de marché d'origine, date du relevé et produit d'origine — comme le fait déjà la
recherche en ligne (cf. docs/CARD_PRICES.md). Une carte sans relevé n'a pas le champ : hors
ligne comme en ligne, l'absence de prix se lit à ce vide, jamais à un zéro.

Les relevés sont lus **par paquets de cartes** (`withMarketPricesStream`, sur
`attachInBatches`) : une requête par paquet, jamais une par carte, et jamais
tous les prix du jeu chargés d'un bloc — ce serait rendre à la mémoire ce que
la génération en flux vient de lui épargner. Le prix pèse une soixantaine
d'octets sur les ~640 d'une carte, et seules les cartes cotées en portent un.

Un document déjà en cache garde les prix de sa génération : ils ne se
rafraîchissent qu'au document suivant, au plus une fois par 24 h.

**Ce qui reste chargé d'un bloc :** erratas et policies, dont le volume est
borné par jeu. `countErratasByGameId` parcourt en outre les identifiants de
toutes les cartes du jeu (projection réduite, quelques mégaoctets pour cent
mille cartes) — deux fois, en comptant `getErratasByGameId`. C'est du temps
plus que de la mémoire, mais c'est le prochain point à reprendre si un jeu
devient très gros.

## Verrou de génération

Le cache expiré, tous les clients réveillés ensemble demandent l'export en même
temps. Sans verrou, chacun déclenchait une génération complète : c'est la
simultanéité, bien plus que le volume, qui épuisait la mémoire d'une instance.

Une génération prend d'abord un verrou par jeu (`game-export-locks`). Son
atomicité tient à un **index unique sur `gameId`** : deux fonctions qui
démarrent ensemble tentent la même insertion et une seule la réussit, l'autre
recevant une erreur de clé dupliquée. Un verrou est relâché en fin de
génération, quelle qu'en soit l'issue, et repris d'office au bout de
`GAME_EXPORT_LOCK_MAX_AGE_MS` (10 minutes) : une fonction tuée en cours de route
— timeout, redéploiement — ne libère pas le sien, et sans péremption le jeu ne
serait plus jamais exporté. Le verrou porte un jeton, pour que celui qui a
dépassé son temps n'efface pas le verrou de celui qui a pris sa suite.

Le verrou obtenu, la fraîcheur du document est **revérifiée** : une autre
instance a pu terminer pendant l'attente, auquel cas il n'y a plus rien à faire.

L'index est créé au premier verrou demandé, et son échec fait échouer la
requête au lieu d'être journalisé puis oublié : sans unicité, l'insertion
concurrente ne lèverait plus de conflit, chaque appelant repartirait avec son
propre verrou et la protection disparaîtrait en silence — exactement dans le
cas qu'elle couvre. Un échec n'est pas mémorisé : la demande suivante
réessaiera plutôt que de condamner l'instance pour une panne passagère.

## Réponses

Toutes portent un champ `status`.

**Document disponible — 200**

```json
{ "status": "ready", "url": "https://…", "size": 57648219, "generatedAt": "2026-08-04T09:00:00.000Z" }
```

**Génération déjà en cours — 409**, avec un en-tête `Retry-After` :

```json
{
  "status": "generating",
  "startedAt": "2026-08-04T09:00:00.000Z",
  "retryAfterSeconds": 120,
  "error": "La génération de l'export de ce jeu est déjà en cours. Réessayez dans quelques minutes."
}
```

Le code 409 est ce qui fait remonter le message jusqu'au joueur sans toucher aux
clients déjà déployés : l'application mobile traite toute réponse non 2xx en
erreur et affiche le champ `error` tel quel. Un 202 aurait été lu comme un
succès, avec une `url` absente.

## Points d'attention

- **La route reste publique et sans durée maximale déclarée.** Le verrou
  supprime l'emballement mémoire, pas le risque de timeout : une génération de
  plusieurs minutes sera coupée par la limite de la plateforme, et le document
  ne sera jamais écrit. Déclarer un `maxDuration` — ou mieux, sortir la
  génération du chemin de requête (cron, ou déclenchement à l'import) — est la
  suite naturelle de ce travail.
- **Le client doit toujours ingérer le document d'un bloc.**
  `offline-download.ts` fait `response.text()` puis `JSON.parse` : à plusieurs
  dizaines de mégaoctets, c'est le mur suivant, et il est côté application.
  Découper l'export (par set, par langue, ou en delta depuis `generatedAt`) est
  le seul remède qui vaille de bout en bout.
- **Un document déjà servi n'est pas remplacé en cas d'échec.** Une génération
  qui échoue laisse en place le dernier document connu, périmé mais lisible.

## Tests

```bash
npm run test
```

`lib/games/export-document.test.ts` relit le JSON produit à partir de ses
fragments : séparateurs, collections vides, règles absentes, échappement. Un
document malformé ne se verrait qu'au téléchargement, chez tous les clients hors
ligne à la fois.
