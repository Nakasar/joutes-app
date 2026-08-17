# Fonctionnalité : Échanges

## Vue d'ensemble

Un échange permet de faire changer des cartes de collection, soit en enregistrant
un échange fait en main propre (sans partenaire sur la plateforme), soit à deux
comptes : chacun compose son offre, les deux valident, et l'échange s'applique aux
deux collections.

Les échanges sont **persistés** dans la collection `trades` : un échange en cours
se reprend plus tard, et les échanges terminés ou annulés restent consultables
dans l'historique.

La recherche de cartes porte sur **tous les jeux**, avec un filtre facultatif par
jeu.

## Parcours utilisateur

| Page | Rôle |
| --- | --- |
| `/trade` | Accueil : nouvel échange, jointure par code, échanges en cours, [historique](#historique) |
| `/trade/[tradeId]` | L'échange lui-même : les deux offres, l'invitation, la validation |
| `/trade/join/[code]` | Cible du QR code d'invitation : montre qui invite, puis rejoint |

### Les deux faces

Un échange a toujours deux faces. La face `a` est celle du créateur, la face `b`
celle de la contrepartie.

| Face | Contenu | Source de recherche par défaut |
| --- | --- | --- |
| Gauche — « Mon offre » | Les cartes que vous cédez, retirées de votre collection | **Ma collection** (cartes possédées) |
| Droite — contrepartie | Les cartes que vous recevez, ajoutées à votre collection | **Toutes les cartes** (catalogue complet) |

Tant qu'aucun compte n'occupe la face de droite, l'échange est **libre** : le
créateur y décrit lui-même ce qu'il reçoit, et la valider applique l'échange
immédiatement (échange en main propre, simplement enregistré). Dès qu'un
partenaire la rejoint, elle lui appartient : elle passe en lecture seule pour le
créateur et se rafraîchit toutes les 5 secondes.

Chaque espace propose un sélecteur de source (**Ma collection** / **Toutes les
cartes**, la valeur par défaut diffère mais reste modifiable), une recherche par
nom (debounce de 300 ms, requêtes en vol annulées), un filtre par jeu et des
résultats paginés annotés du nombre d'exemplaires possédés.

Recherche dans la collection : une recherche vide liste toute la collection.
Recherche dans le catalogue : au moins 2 caractères sont requis, le catalogue
couvrant tous les jeux.

### Inviter un partenaire

Trois moyens, depuis le bouton **Inviter un partenaire** :

- **QR code** — encode `/trade/join/<code>` ; le partenaire le scanne avec
  l'appareil photo de son téléphone et ouvre le lien avec son compte ;
- **code d'invitation** — 8 caractères sans caractères ambigus, à recopier dans
  le champ « Rejoindre un échange » de `/trade` ;
- **tag `pseudo#1234`, nom d'utilisateur ou adresse e-mail** — le joueur est
  installé directement sur la face libre et reçoit une notification.

Le créateur peut retirer son partenaire, et le partenaire peut quitter l'échange :
la face redevient libre et son offre est effacée.

### Validation

Chaque face occupée par un compte doit valider. Le bouton ouvre une **modale de
confirmation** récapitulant les deux offres.

- une seule face possédée (échange libre) → la validation applique l'échange ;
- deux faces → l'échange s'applique dès que les deux ont validé, dans la requête
  de validation du second joueur. Chacun peut retirer sa validation pour retoucher
  son offre.

**Toute modification d'une offre annule les validations en cours** et incrémente
la révision de l'échange. La validation transmet la révision affichée : on ne peut
pas valider un contenu modifié depuis (réponse `409 conflict`, le client se
resynchronise).

## Historique

Les échanges terminés ou annulés restent consultables. Ce qu'on en voit dépend
d'un seul droit, `trades:full_history`, ouvert par **Joutes Expert** et **Joutes
Pro** — et accordable à la main, c'est une permission ordinaire (voir
`docs/SUBSCRIPTIONS.md`).

| | Sans le droit | Avec le droit |
| --- | --- | --- |
| Profondeur | Les **7 derniers jours** | Tout |
| Filtres | Aucun | Nom de carte, partenaire, plage de dates, tri |
| Pagination | Oui | Oui |

La fenêtre porte sur `updatedAt`, et non sur `completedAt`/`cancelledAt` : rien
ne touche plus à un échange une fois clos, les trois dates coïncident, mais seul
`updatedAt` est indexé avec `sides.userId`.

**La restriction est appliquée côté serveur**, dans `resolveHistoryQuery`
(`lib/trade/history.ts`) : sans le droit, les filtres reçus sont **écartés** et
la fenêtre imposée à leur place. Masquer les champs dans l'écran n'aurait rien
protégé — l'API reste appelable, et un `from=2020-01-01` aurait rendu tout
l'historique. C'est ce que vérifie `lib/trade/history.test.ts`.

Le filtre par partenaire se rapproche **en mémoire**, sur la liste des gens avec
qui on a effectivement échangé (`listTradeHistoryPartners`), jamais sur
l'annuaire : filtrer son propre historique ne doit pas pouvoir servir à savoir
qui existe ailleurs sur la plateforme.

L'écran dit d'où vient ce droit, dans les deux sens : le cadre de filtres porte
le badge du palier qui les ouvre (`planGrantingPermission`, qui rend `null` pour
un administrateur ou une permission accordée à la main — il n'y a alors aucun
abonnement à créditer) ; à qui n'y a pas droit, il montre le même cadre éteint,
avec un bouton « Débloquer l'historique avec Joutes Expert » qui mène aux offres.

Le bouton **reste cliquable** malgré son apparence verrouillée : montrer une
fonctionnalité hors d'atteinte sans dire où la trouver en ferait un cul-de-sac.

`hiddenCount` compte les échanges clos plus anciens que la fenêtre, et s'affiche
sous le bouton quand il est non nul.

## Modèle de données

Collection `trades` :

```js
{
  code: "7KQMB2XZ",                  // code d'invitation (index unique)
  status: "open" | "completed" | "cancelled",
  revision: 3,                       // incrémenté à chaque modification d'offre
  sides: [
    { id: "a", userId: ObjectId, cards: [snapshot], validatedAt: Date | null },
    { id: "b", cards: [], validatedAt: null },   // `userId` absent = contrepartie libre
  ],
  createdBy: ObjectId, createdAt: Date, updatedAt: Date,
  completedAt: Date | null, cancelledAt: Date | null, cancelledBy: ObjectId,
  applying: true,                    // verrou transitoire pendant l'application
}
```

Un *snapshot* de carte est `{ cardId?, name, setCode, collectorNumber, image,
gameId?, gameName?, quantity }`. Il est **toujours résolu côté serveur** :

- face d'un participant → relue depuis sa collection (`collection-cards`) par
  `(name, setCode, collectorNumber)`, la quantité étant bornée aux exemplaires
  réellement possédés et les cartes non possédées écartées ;
- contrepartie libre → relue depuis le catalogue par `cards.id`.

Le client ne fait donc que **désigner** des cartes ; il n'en fournit jamais les
données. Les deux identités diffèrent volontairement : `cards.id` n'est pas
strictement unique (voir la note de `lib/db/collection.ts`), alors que le triplet
nom + extension + numéro est ce que le reste de la collection utilise pour compter
les exemplaires.

Index : `{ code: 1 }` unique et `{ "sides.userId": 1, updatedAt: -1 }`, créés de
façon idempotente au premier usage.

### Application de l'échange

Pour chaque face occupée par un compte : ses cartes sont retirées de sa
collection, et celles de la face d'en face y sont ajoutées (avec un `obtainedAt`
à la date du jour).

- les exemplaires marqués prêtés (`borrowedBy`) partent en dernier ;
- les annonces de vente liées aux exemplaires retirés sont supprimées en cascade,
  en nettoyage au mieux (à ce stade l'échange n'est plus annulable, un échec du
  nettoyage ne doit pas le faire échouer) ;
- tout est vérifié avant la moindre écriture. MongoDB pouvant tourner en
  standalone en développement — donc sans transactions — les insertions précèdent
  les suppressions et sont annulées si celles-ci échouent : une erreur ne peut pas
  faire disparaître de cartes ;
- un verrou `applying` garantit qu'un échange n'est appliqué qu'une fois, même si
  les deux joueurs valident au même instant.

Si le stock a changé entre la composition et la validation, l'échange n'est pas
appliqué : il redevient modifiable, validations remises à zéro, et l'erreur
`insufficient-copies` liste les cartes en cause.

Rien n'empêche de proposer les mêmes exemplaires dans deux échanges ouverts en
parallèle : le premier validé les consomme, le second échoue proprement sur
`insufficient-copies`.

## API

Toutes les routes exigent une session.

| Route | Rôle |
| --- | --- |
| `GET /api/trades` | `{ open, past, pastTotal, hiddenCount }` — échanges de l'utilisateur |
| `GET /api/trades/history` | Historique filtré et paginé (`card`, `partner`, `from`, `to`, `sort`, `page`, `limit`) |
| `POST /api/trades` | Ouvre un échange (contrepartie libre) → `201 { trade }` |
| `GET /api/trades/[tradeId]` | État courant (offres, validations, révision) ; 404 hors participants |
| `DELETE /api/trades/[tradeId]` | Annule l'échange |
| `PUT /api/trades/[tradeId]/offer` | `{ target: "mine" \| "counterparty", cards }` — remplace une offre |
| `POST /api/trades/[tradeId]/partner` | `{ identifier }` — tag, nom d'utilisateur ou e-mail |
| `DELETE /api/trades/[tradeId]/partner` | Libère la face du partenaire (retrait ou départ) |
| `POST /api/trades/[tradeId]/validate` | `{ revision }` — valide, et applique si tout le monde a validé |
| `DELETE /api/trades/[tradeId]/validate` | Retire sa validation |
| `POST /api/trades/join` | `{ code }` — rejoint par code, idempotent |
| `GET /api/trades/cards` | Recherche de cartes (`scope`, `q`, `gameId`, `page`, `limit`) |

`GET /api/trades/cards` renvoie `{ items, total, page, limit, totalPages,
needsQuery }`, chaque `item` portant `{ key, cardId?, name, setCode,
collectorNumber, image, type?, gameId?, gameName?, gameSlug?, owned }`.
`needsQuery` vaut `true` quand une recherche catalogue a été ignorée faute d'un
terme assez long.

### Erreurs

| `error` | Statut | Sens |
| --- | --- | --- |
| `not-found` | 404 | Échange inexistant, ou l'utilisateur n'y participe pas |
| `user-not-found` | 404 | Aucun joueur pour l'identifiant fourni |
| `forbidden` | 403 | Face qui n'appartient pas à l'appelant |
| `closed` | 409 | Échange terminé, annulé ou en cours d'application |
| `conflict` | 409 | Révision périmée ou écriture concurrente |
| `side-taken` | 409 | La contrepartie a déjà un partenaire |
| `insufficient-copies` | 409 | Exemplaires cédés plus possédés (avec `details`) |
| `self-trade` | 400 | Échange avec soi-même |
| `empty` | 400 | Échange sans aucune carte |
| `unknown-cards` | 400 | Carte inconnue du catalogue (contrepartie libre) |

Les réponses d'erreur incluent l'état de l'échange (`trade`) quand il est connu,
pour que le client se resynchronise sans requête supplémentaire.

## Notifications

Le partenaire est prévenu (`lib/services/trade-notifications.ts`, best-effort) en
cas d'invitation, d'arrivée par code, de départ ou de retrait, de validation de
l'autre offre, d'échange effectué et d'annulation.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `app/trade/page.tsx`, `TradeHubClient.tsx` | Accueil : création, jointure, en cours, historique |
| `app/trade/TradeHistory.tsx` | Historique : filtres, pagination, invitation à s'abonner |
| `app/trade/TradeRow.tsx` | Une ligne d'échange, commune aux deux listes |
| `app/trade/[tradeId]/page.tsx`, `TradeEditor.tsx` | L'échange : offres, validation, polling |
| `app/trade/[tradeId]/TradeInviteDialog.tsx` | QR code, code d'invitation, invitation directe |
| `app/trade/join/[code]/page.tsx`, `JoinTradeClient.tsx` | Jointure depuis le QR code |
| `app/trade/TradePanel.tsx` | Un espace : recherche, résultats paginés, cartes retenues |
| `app/api/trades/**` | Endpoints |
| `lib/db/trades.ts` | Recherche de cartes et cycle de vie des échanges |
| `lib/trade/history.ts` | Fenêtre visible, normalisation et restriction des filtres |
| `lib/schemas/trade.schema.ts` | Validation Zod des corps de requête |
| `lib/constants/trade.ts` | Bornes partagées serveur / client |
| `lib/api/trade-errors.ts` | Correspondance erreur d'échange → statut HTTP |
| `lib/services/trade-notifications.ts` | Notifications au partenaire |

## Navigation

Le lien **Échange** est ajouté au menu « Ma collection » du header (desktop,
tablette et mobile), aux côtés de la collection, des listes de souhaits et de la
liste de vente.

## Traductions

Namespace `Trade` dans `messages/{fr,en,it,de}.json`, plus l'entrée
`Header.menu.Trade`.

## Limites connues

- Le QR code est destiné à être scanné par l'appareil photo du téléphone : il n'y
  a pas de scanner intégré à la page d'échange (contrairement aux codes amis).
- Un échange ne peut réunir que deux faces.
- L'invitation par e-mail exige un compte existant : aucun compte invité n'est
  créé à cette occasion.
- Un plantage du serveur pendant l'application d'un échange laisserait le verrou
  `applying` posé, l'échange restant alors bloqué en « en cours » ; les échecs
  applicatifs, eux, relâchent bien le verrou.
