# Abonnements (Supporter, Expert, Pro)

Trois offres adossées à [Patreon](https://www.patreon.com/joutes) : **Supporter**
(1 €), **Joutes Expert** (5 €) et **Joutes Pro** (19 €).

## Le principe

Patreon est la source de vérité. On n'en garde qu'une **projection**, réécrite à
chaque signal et jamais éditée à la main. Un droit ne s'accorde ni ne se
révoque : il se **recalcule** depuis `currently_entitled_tiers`.

C'est ce qui rend la fin d'abonnement gratuite. Patreon conserve le palier
jusqu'à la fin de la période payée ; le jour où il le retire, notre liste de
plans se vide et tout ce qui en dépend bascule au rendu suivant. Il n'y a aucune
expiration à calculer, aucune révocation à écrire, et aucune fenêtre pendant
laquelle les deux systèmes se contrediraient.

Corollaire important : **un paiement refusé n'éteint rien tant que Patreon laisse
le palier**. `patron_status` est stocké pour l'affichage, il ne conditionne
jamais un droit.

## Où ça vit

| Fichier | Rôle |
| --- | --- |
| `lib/constants/subscription-plans.ts` | La table des offres. Le type, les clés, les options et le garde-type en descendent |
| `lib/subscriptions/entitlements.ts` | **Pur.** Plans → droits, sièges, plan d'affichage |
| `lib/subscriptions/seats.ts` | **Pur.** Règles de rattachement d'un lieu |
| `lib/subscriptions/tone.ts` | **Pur.** Teinte d'un palier → classes Tailwind |
| `lib/subscriptions/access.ts` | L'API que le reste du code appelle |
| `lib/db/subscriptions.ts` | La collection `subscriptions`, ses index, ses écritures |
| `lib/db/subscription-events.ts` | Le journal : idempotence des webhooks et enquête |
| `lib/patreon/resolve.ts` | **Pur.** Le seul module qui connaît la forme JSON:API de Patreon |
| `lib/patreon/webhook.ts` | **Pur.** Vérification HMAC-MD5 |
| `lib/patreon/api.ts` | Le client HTTP, à résultat discriminé |
| `lib/patreon/sync.ts` | Orchestration : lire → résoudre → écrire |
| `app/api/patreon/webhook/route.ts` | Réception des signaux |
| `app/api/cron/patreon-reconcile/route.ts` | Le filet quotidien |
| `app/pricing/` | La page publique d'offres |
| `app/account/subscription/` | « Mon abonnement » |

## Vérifier un droit

```ts
import { hasEntitlement, requireEntitlement, lairHasPro } from "@/lib/subscriptions/access";

if (await hasEntitlement("sub:profile-border")) { … }
await requireEntitlement("sub:lair-pro");        // jette si le droit manque
if (await lairHasPro(lairId)) { … }               // droits d'un lieu
```

Sur une **liste** de lieux, ne jamais boucler `lairHasPro` : un seul appel à
`proLairIds(ids)` évite le N+1.

Les droits d'abonnement **ne se mélangent pas aux permissions**
(`lib/db/permissions.ts`). Une permission s'accorde à la main et vaut capacité
d'équipe ; un droit d'abonnement s'achète et se recalcule. Les fusionner ferait
qu'un abonnement expiré pourrait retirer un droit de modérateur. Tout droit
d'abonnement porte d'ailleurs le préfixe `sub:`, qu'aucune permission n'emploie.

## Une offre qui ouvre une permission

Certaines capacités ont besoin des **deux** portes : `trades:full_history`
arrive avec Joutes Expert et Joutes Pro, et doit aussi pouvoir s'accorder à la
main — une boutique partenaire sans abonnement, un bêta-testeur. Un droit `sub:`
ne le permettrait pas : il ne s'obtient qu'en donnant le palier entier.

Ces capacités-là se déclarent dans le champ `permissions` du palier, **sans
préfixe** :

```ts
expert: { …, entitlements: [], permissions: ["trades:full_history"] },
```

et se vérifient comme n'importe quelle permission :

```ts
import { hasPermission } from "@/lib/db/permissions";

if (await hasPermission("trades:full_history")) { … }
```

`hasPermission` compose alors trois sources : `user.permissions[]`, le statut
d'administrateur, et les paliers portés. `getMyPermissions` les rend dans la
même liste — un client se demande « ai-je le droit ? », pas « d'où me vient ce
droit ? ».

**La séparation qui protège les deux systèmes ne porte pas sur les noms mais sur
les écritures** : aucun abonnement n'écrit jamais dans `user.permissions[]`, la
composition a lieu en lecture. Une rétrogradation Patreon ne peut donc pas
effacer un droit de modérateur ; elle cesse seulement d'apporter le sien.

Deux tests gardent la frontière (`lib/constants/subscription-plans.test.ts`) :
aucune permission de palier ne porte `sub:`, et aucune ne figure parmi les
capacités d'équipe.

## Ajouter un droit à une offre

Une ligne dans `lib/constants/subscription-plans.ts` — `entitlements` pour un
droit propre à l'abonnement, `permissions` pour une capacité qui s'accorde aussi
à la main — puis l'appel `requireEntitlement` ou `hasPermission` là où la
fonctionnalité vit. Rien d'autre : ni migration, ni liste à tenir ailleurs.

Ne déclarer que des droits que le code lit réellement. Un droit déclaré sans
vérification correspondante donne une page d'offres qui promet ce que personne
ne contrôle.

### Ce que chaque offre ouvre aujourd'hui

| Palier | Droits `sub:` | Permissions |
| --- | --- | --- |
| Supporter | `sub:profile-badge`, `sub:profile-border` | — |
| Joutes Expert | *(hérite de Supporter)* | `trades:full_history`, `collection:advanced` |
| Joutes Pro | `sub:lair-pro` *(+ Supporter)* | `trades:full_history`, `collection:advanced` |

### Un droit qui profite à un groupe

`collection:advanced` — plusieurs listes de souhaits — se vérifie aussi à
l'échelle d'un **groupe de jeu**, où il suffit qu'un seul membre soit abonné.

Le droit reste celui d'une personne ; le groupe en profite. C'est
`anyUserHasPermission(ids, permission)` qui répond, en deux lectures quelle que
soit la taille du groupe — boucler `hasPermission` ferait un N+1, et ne
marcherait pas de toute façon, celle-ci ne sachant regarder que le compte
connecté.

`ownerHasAdvancedCollection` (`lib/db/collection-access.ts`) tranche entre les
deux cas et **ne consulte pas la session** : elle porte sur le propriétaire, qui
n'est pas toujours l'appelant. C'est ce qui lui permet de vivre sous
`createWishlist` plutôt que dans chaque route — trois chemins y mènent (API
personnelle, API de groupe, outil MCP), et une vérification par route en aurait
laissé échapper au moins un.

La limite ne vaut qu'à la **création** : un compte qui tenait déjà plusieurs
listes les garde toutes. Elles ne restent pourtant pas toutes utilisables — voir
ci-dessous.

### La liste par défaut

Chaque propriétaire en a exactement une : la première qu'il crée, la plus
ancienne restante si celle-là est supprimée, ou celle qu'il désigne. L'unicité
est portée par un **index unique partiel** plutôt que par le code — deux
requêtes concurrentes qui promeuvent chacune une liste ne peuvent pas en laisser
deux marquées.

Elle sert à deux choses :

- **l'ajout rapide** d'une carte y verse toujours ;
- sans gestion avancée, **elle seule reste modifiable**. Les autres s'affichent
  en grisé, consultables : rien n'est perdu, et tout redevient utilisable le jour
  où le propriétaire s'abonne.

Deux gestes restent permis sur une liste verrouillée : la **supprimer** — sans
quoi on garderait une liste dont on ne peut ni se servir ni se défaire — et la
**désigner par défaut**, ce qui ne donne aucune capacité de plus, seulement le
choix de celle dont on se sert. C'est pourquoi la désignation a sa propre route,
`PUT /api/wishlists/[id]/default`, que le garde de lecture seule ne couvre pas.

⚠️ Il n'y a **aucun système de migration** dans ce dépôt :
`ensureDefaultWishlistId` rattrape les propriétaires d'avant ce champ. Sans ce
rattrapage, aucune de leurs listes ne porterait le marqueur, et la règle « sauf
celle par défaut » n'en épargnerait aucune — elles seraient toutes verrouillées
d'un coup.

## Configuration

Voir `.env.example`. Rien n'est obligatoire : sans identifiant ni secret client,
la liaison s'affiche désactivée, le webhook répond 503, le cron ne fait rien, et
`/pricing` affiche « bientôt disponible ». Le site fonctionne, l'abonnement dort.

**Renseigner `PATREON_TIER_*` dès que possible.** Sur Patreon, un mécène est sur
**un** palier : le mapping par identifiant lui ouvre exactement l'offre choisie.
Le repli par montant, lui, franchit tous les seuils inférieurs — un abonné Pro y
obtiendrait aussi Expert et Supporter, ce qui n'est pas ce qu'on vend. Les
identifiants se lisent dans l'URL de chaque palier sur la page de gestion de la
campagne.

## Vérifier sans campagne Patreon

### 1. Les tests

```bash
npm test
```

Couvrent la résolution des paliers, la signature, les règles de sièges et les
invariants de la table — sans réseau ni base.

### 2. Un abonnement écrit à la main

Le chemin de recette le plus direct, exactement comme on pose une permission :

```js
db.subscriptions.insertOne({
  userId: "<votre id>", provider: "patreon",
  providerUserId: null, providerMemberId: null,
  plans: ["supporter", "pro"], seats: [],
  entitledTierIds: [], entitledAmountCents: 1900,
  patronStatus: null, lastChargeStatus: null,
  syncedAt: new Date(), syncSource: "manual",
  createdAt: new Date(), updatedAt: new Date(),
});
```

Puis vérifier, dans l'ordre : `/account/subscription` montre l'offre ;
`/api/users/me/permissions` rend `plans` et `entitlements` ; le badge et le
contour apparaissent sur `/users/<tag>` ; enfin
`db.subscriptions.updateOne({userId}, {$set:{plans:[]}})` les fait disparaître au
rendu suivant **en laissant les sièges**, et remettre `plans` les rétablit sans
rien rattacher. Cette dernière étape *est* la vérification de la règle de fin
d'abonnement.

### 3. Un aperçu, sans écrire en base

```
PATREON_DEV_FORCE_PLAN=supporter,pro
```

Force ces offres pour tout compte connecté. **Sans effet en production**, où une
variable oubliée offrirait sinon un abonnement à tout le monde.

### 4. Le webhook, en boucle locale

Le secret est le nôtre : on peut donc signer une charge utile exactement comme
Patreon le ferait.

```bash
BODY=$(cat <<'JSON'
{"data":{"id":"member-1","type":"member","attributes":{"patron_status":"active_patron","currently_entitled_amount_cents":1900,"last_charge_status":"Paid"},"relationships":{"currently_entitled_tiers":{"data":[{"id":"tier-pro","type":"tier"}]},"user":{"data":{"id":"patreon-user-1","type":"user"}}}},"included":[]}
JSON
)
SIG=$(printf '%s' "$BODY" | openssl dgst -md5 -hmac "$PATREON_WEBHOOK_SECRET" -hex | awk '{print $2}')
curl -X POST http://localhost:3000/api/patreon/webhook \
  -H "Content-Type: application/json" \
  -H "X-Patreon-Event: members:update" \
  -H "X-Patreon-Signature: $SIG" \
  --data-raw "$BODY"
```

Attendu : `200`, et une ligne dans `subscription_events`. Rejouer la commande à
l'identique → `200 {"alreadyProcessed":true}` **sans** seconde ligne. Changer un
caractère de `$SIG` → `401`.

### 5. La vraie liaison OAuth, toujours sans campagne

Enregistrer un **client OAuth** Patreon ne demande pas de campagne existante.
Renseigner `PATREON_CLIENT_ID` et `PATREON_CLIENT_SECRET`, cliquer « Lier » sur
`/account/subscription`, aller au bout : on obtient un document `account` avec
`providerId: "patreon"`, et la page affiche « aucun abonnement » — parce que
`/identity` ne rend légitimement aucune adhésion.

## Un palier offert à la main

Un administrateur peut donner Supporter, Expert ou Pro sans paiement — boutique
partenaire, bêta-testeur, remerciement — depuis la page de profil de la personne.
L'octroi ouvre **exactement les mêmes droits** qu'un palier payé : le badge, le
contour, les sièges de lieu, tout suit.

Il vit dans `grantedPlans`, à côté de `plans`, sur le même document. C'est
essentiel : `plans` est une projection de Patreon réécrite en bloc à chaque
signal, et vidée à la déliaison. Un octroi qui s'y trouverait disparaîtrait au
premier webhook.

**La protection tient à une absence.** MongoDB laisse intact un champ qu'on ne
lui demande pas d'écrire, donc `upsertFromSnapshot` protège `grantedPlans` en ne
le mentionnant simplement pas dans son `$set`. C'est robuste et parfaitement
invisible : ne jamais l'y ajouter « par symétrie », ce serait effacer les octrois
sans qu'aucune erreur ne le signale, la synchronisation ayant « réussi ». Un
commentaire le dit sur place, et un test le prouve indirectement en vérifiant
qu'un palier offert survit à un `plans` vidé.

La composition se fait dans `lib/subscriptions/grants.ts`, module pur et testé,
branché en un seul endroit — `plansFromSubscription` de `access.ts`.
`getMySubscriptionSummary` distingue en revanche les deux origines, pour que
l'écran de compte n'annonce pas « abonnement actif » à quelqu'un qui irait
ensuite chercher sur Patreon un prélèvement qui n'existe pas.

## Statuts

Un statut — « Fondateur », « Modérateur », « Ambassadeur » — est un **succès
marqué `isStatus`**, pas une notion séparée : catalogue, attribution et retrait
sont ceux des succès. Il s'affiche en badge à côté du pseudonyme au lieu de la
liste des succès, n'ouvre aucun droit, et coexiste avec une offre payée.

Il s'affiche **quel que soit `isPublicProfile`** : un profil privé l'est sur son
contenu, et une marque de reconnaissance posée par l'équipe n'est pas du contenu.

Les teintes vivent dans `lib/achievements/status-tone.ts`, séparées de celles des
offres, et un test vérifie qu'aucune ne coïncide — un « Fondateur » qui porterait
les classes de Supporter se lirait comme un abonné.


## Montrer un badge à côté d'un pseudonyme

Palier et statuts s'affichent partout où un nom de compte apparaît : liste
d'amis, écrans d'échange, auteur d'une actualité, d'un errata ou d'une politique,
créateur d'un cube, propriétaire d'une liste de vente ou de souhaits, membres
d'un groupe de jeu.

**Toujours en lot.** `lib/db/user-badges.ts` résout une liste entière en trois
lectures, quelle que soit sa longueur ; les chercher un par un ferait un N+1 sur
chacun de ces écrans.

| Besoin | Fonction |
| --- | --- |
| Une liste de comptes déjà lue | `getUserBadges(ids)` |
| Des identifiants seuls (auteur d'un contenu) | `getAuthorSummaries(ids)` |
| Un compte isolé | `getBadgesForUser(id)` — mémoïsé par requête |

**Lancer la lecture des badges en parallèle de celle des profils**, et non après :
les badges ne dépendent que des identifiants, connus avant les deux. Les
enchaîner allonge le chemin critique d'un aller-retour pour rien.

À l'affichage : `<UserBadges badges={…} />`, ou `<UserLabel user={…} />` quand il
faut aussi écrire le pseudonyme. **La rangée qui les accueille doit porter
`flex-wrap`** — `Badge` est `shrink-0`, et `scripts/check-flex-rows.mjs` le
vérifie.

Les badges mènent à `/pricing`, sans quoi personne ne saurait ce que le mot
désigne. Ils naviguent par `BadgeLink`, qui **n'est pas un `<a>`** : la plupart
vivent dans une carte déjà enveloppée d'un lien, et une ancre dans une ancre est
du HTML invalide — le navigateur referme la première, et la moitié de la carte
cesse de mener où elle promettait.

Le forçage `PATREON_DEV_FORCE_PLAN` ne s'applique **pas** aux badges d'une liste :
il vaut pour « mes » droits, et l'appliquer en lot badgerait tout le monde du
même palier.

## Pièges à connaître

**Ne jamais éteindre un abonnement sur un échec de lecture.** C'est la règle qui
gouverne `lib/patreon/api.ts` : ses fonctions rendent un résultat discriminé, et
`sync.ts` n'écrit que sur succès. Il n'existe aucun chemin de code depuis « la
requête a échoué » vers `plans: []`. Une panne d'API interprétée comme « aucun
palier » éteindrait tous les abonnés d'un coup, et Patreon documente des 504 sur
`/identity` pour les comptes à nombreuses adhésions.

**Ne jamais ajouter `grantedPlans` au `$set` d'`upsertFromSnapshot`.** Toute la
survie des paliers offerts en dépend, et rien ne signalerait l'erreur : la
synchronisation réussirait, et les octrois disparaîtraient.

**Le retrait d'un succès compare `achievementId` en tant que chaîne**, sans
`ObjectId` — c'est ainsi qu'il est inséré. L'envelopper ne supprimerait
silencieusement rien.

**Le corps d'un webhook se lit brut.** `await req.text()`, jamais `req.json()` :
la signature porte sur les octets reçus. Le webhook Discord (`app/discord/route.ts`)
vérifie un corps re-sérialisé, ce qui ne fonctionne que parce que son JSON fait
un aller-retour identique dans V8. Ne pas recopier ce motif ; un test de
non-régression tient la différence.

**Les index se créent au chargement du module.** Ce dépôt n'a aucun système de
migration : sans la promesse mémoïsée de `lib/db/subscriptions.ts`, l'unicité du
siège — qui garantit qu'un lieu n'est parrainé que par un seul abonnement —
n'existerait tout simplement pas.

**Les scopes Patreon sont volontairement étroits.** `identity` et
`identity[email]`, pas `identity.memberships` : sans ce dernier, Patreon ne rend
que l'adhésion à *notre* campagne, ce qui est exactement ce qu'il nous faut.
L'ajouter exposerait les adhésions du mécène à tous les autres créateurs.

**« Le compte est-il lié ? » se lit dans `account`, pas dans `subscriptions`.**
`subscriptions.providerUserId` n'est écrit que par une synchronisation réussie :
c'est une *projection*, pas le lien. Les confondre a produit un blocage complet —
un compte que better-auth tenait pour lié se voyait annoncer « non lié », et
proposer de lier de nouveau, ce que better-auth refuse ; le bouton
« resynchroniser », réservé aux comptes liés, restait invisible. Aucune sortie.
`findPatreonAccountId` (`lib/patreon/sync.ts`) interroge la seule autorité sur le
lien.

**Trois états, et non deux.** Lier un compte qui n'est mécène de rien réussit
parfaitement et ne rapporte aucune adhésion — c'est le cas du porteur de la
campagne, et de quiconque lie son compte avant de choisir un palier.

| État | `linkedToProvider` | `hasProviderMembership` |
| --- | --- | --- |
| Aucun compte Patreon rattaché | faux | faux |
| Rattaché, sans adhésion à la campagne | vrai | faux |
| Rattaché, adhésion trouvée | vrai | vrai |

`hasProviderMembership` se dérive de `providerMemberId`, et **surtout pas** de
`providerUserId` : celui-ci est écrit dès qu'une lecture aboutit, adhésion ou
non. L'en tirer rendrait le drapeau toujours vrai après une liaison, et
l'explication « aucune adhésion rattachée » ne s'afficherait jamais à ceux à qui
elle est destinée.

**Lier ne synchronise pas tout seul.** better-auth écrit `account` et redirige ;
il ne sait rien des paliers. C'est `SyncAfterLink`, sur la page de compte, qui
appelle la resynchronisation au retour — reconnaissable au paramètre
`?linked=patreon` de son `callbackURL`. Changer ce paramètre d'un côté sans
l'autre laisse des comptes liés sans aucun palier.

**Patreon est un fournisseur de liaison, pas de connexion.** `disableSignUp: true`
dans `lib/auth.ts` : sans lui, un inconnu se créerait un compte Joutes via
Patreon.

**Les déclencheurs v1 sont morts.** Utiliser `members:*`, jamais `pledges:*`,
retirés le 7 octobre 2026.

## Ce qui reste à faire

- Les fonctionnalités elles-mêmes : IA, statistiques de groupe, prêt de cartes,
  gestion de réservation avancée, mise en avant d'évènements, personnalisation de
  la page de lieu
- Prévenir les propriétaires d'un lieu quand son parrain s'éteint — la ligne
  `subscription_events` contient déjà tout ce qu'il faut
- Préciser dans les CGU le périmètre, le prix et les conditions des offres
