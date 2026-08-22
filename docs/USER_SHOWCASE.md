# Vitrines de profil, registre de la communauté et publications

La page d'un compte était une pile de sept cartes ; `/users` — la « Communauté »
annoncée par ses propres métadonnées — était `<h1>Users</h1>`. Les deux ont
rejoint la grammaire des lieux et des groupes de jeu : bannière, en-tête
d'identité, barre d'onglets collante, colonne stable, et des blocs dont le
compte règle l'ordre et la présence.

## Le principe

**L'identité visuelle d'un profil n'est pas peinte par son propriétaire.** Le
contour de l'avatar et le badge de palier se **dérivent** du palier affiché
(`lib/subscriptions/tone.ts`), les statuts sont posés par l'équipe
(`lib/achievements/status.ts`). Aucun réglage de « Ma vitrine » ne les touche,
et l'écran le dit en toutes lettres — sans quoi on le chercherait.

**Un profil privé garde son pseudonyme et ses badges**, et il se rend au lieu de
disparaître. Une marque de reconnaissance posée par l'équipe n'est pas du
contenu. La liste de vente et les listes de souhaits marquées publiques restent
elles aussi visibles : leur visibilité se décide liste par liste, et a déjà été
décidée. `notFound()` sur un profil privé casserait de surcroît la modération —
un profil qu'on ne peut plus atteindre est un profil qu'on ne peut plus
signaler.

## Où ça vit

| Fichier | Rôle |
| --- | --- |
| `lib/users/showcase.ts` | **Pur.** L'ordre et l'activation des blocs, et la réinsertion d'un bloc absent à sa place par défaut |
| `lib/users/profile-tabs.ts` | **Pur.** Quels onglets existent : un bloc éteint ou vide n'en a pas |
| `lib/users/handle.ts` | **Pur.** Du segment d'URL au compte, et retour |
| `lib/users/links.ts` | **Pur.** Les liens fondus, nettoyés, et l'icône déduite du domaine |
| `lib/users/completion.ts` | **Pur.** La jauge et la liste d'amorçage, d'une seule source |
| `lib/users/registry-search.ts` | **Pur.** Ce que le registre comprend de son URL |
| `lib/content/items.ts` | **Pur.** Le rangement des contenus, partagé par les deux vitrines |
| `lib/db/user-followers.ts` | La collection `userFollowers` |
| `lib/db/user-contents.ts` | La collection `userContents` |
| `lib/db/users.ts` | La recherche publique, le classement, l'écriture de la vitrine |
| `app/[locale]/(app)/users/registry-data.ts` | Ce que le registre lit, une fois par rendu |
| `app/[locale]/(app)/users/[userTagOrId]/profile-data.ts` | Ce que la vitrine lit, une fois par rendu |
| `app/[locale]/(app)/account/showcase/` | L'onglet « Ma vitrine » |
| `app/[locale]/(app)/account/contents/` | Les publications d'un joueur |
| `app/api/users/me/upload/route.ts` | Le dépôt de l'avatar et de la bannière |
| `scripts/ensure-indexes-for-user-profiles.ts` | Les index, posés par script |

Les modules marqués **purs** le sont pour une raison mécanique : `npm test` ne
couvre que `lib/**`, et `lib/db/*` ouvre une connexion MongoDB au chargement,
donc aucun test ne peut l'importer. Toute la logique qui mérite un test vit
hors de la base.

## Les blocs

`USER_SHOWCASE_SECTION_KEYS` porte l'ordre par défaut. Ce qui est stocké est une
liste partielle de `{ key, enabled }`, et **l'ordre du tableau est l'ordre de
rendu**. Un compte qui n'a rien réordonné n'a rien en base.

`readUserShowcaseSections` garantit trois choses : toutes les clés connues
reviennent, exactement une fois, les inconnues sont écartées ; un bloc absent du
stockage — parce qu'il a été ajouté après le dernier enregistrement — revient
**à sa place par défaut** et non en fin de liste ; et « souhaits et ventes »
revient toujours allumé, sa visibilité se réglant liste par liste.

Ajouter un bloc plus tard ne demande donc aucune migration.

## Les onglets

Cinq — vitrine, decks, publications, succès, souhaits et ventes. « Vitrine »
empile tous les blocs activés, les autres n'en isolent qu'un. **Un onglet dont
le bloc est éteint ou vide n'est pas rendu**, et une barre qui n'aurait plus que
« Vitrine » ne se rend pas du tout : la barre décrit ce qui est là, jamais ce
qui pourrait l'être.

L'onglet vit dans `?tab=` et non dans un segment de route. La configuration de
routage de Vercel plafonne à 2048 entrées et chaque segment y est multiplié par
les quatre locales — c'est la raison qui a mené les groupes de jeu au `?view=`
et les lieux au `?tab=`, et elle vaut ici aussi.

## Suivre, et être ami

**Deux relations, et c'est délibéré.** S'abonner ne demande rien à personne : on
suit une vitrine comme on suit un lieu, et le compteur d'abonnés le dit. Devenir
ami se demande et s'accepte, et ouvre la collection et les parties partagées.
Les confondre sous un seul bouton aurait obligé à choisir lequel des deux gestes
abandonner.

L'abonnement vit dans une collection dédiée, `userFollowers`, calquée sur celle
des groupes de jeu : le document `user` est aussi écrit par better-auth, un
tableau d'abonnés y croîtrait sans borne, et le registre a besoin de compter les
abonnés de vingt comptes en une requête plutôt qu'en vingt.

## Les publications

Un joueur publie des vidéos, des articles et des replays, avec la même
grammaire que les contenus d'un groupe — un article porte son texte, une vidéo
et un replay portent leur adresse — et une visibilité que les contenus de groupe
n'ont pas. **Le brouillon est le défaut** : on écrit avant de montrer.

`userContents` est une collection de tête et non un sous-document du compte,
parce qu'il faut pouvoir demander « les contenus publics des membres de ce
groupe » — question qu'un tableau rangé dans chaque compte ne sait répondre
qu'en relisant tous les comptes.

Un contenu **public** remonte donc sur les vitrines des groupes de son auteur,
mêlé à ceux du groupe et trié par date. Il y porte le nom de son auteur, celui
du groupe n'en porte pas — sans quoi un groupe paraîtrait signer des vidéos
qu'il n'a pas choisies. Et il se lit sur le profil de son auteur, là où il est
signé et là où son auteur peut le corriger.

L'enregistrement invalide donc aussi les vitrines des groupes du compte : ne pas
le faire laisserait un brouillon affiché là où on croyait l'avoir caché.

## Le registre

Quatre filtres, qui sont exactement les quatre raisons qu'on a de parcourir un
annuaire de joueurs : jouer au même jeu, habiter près, chercher une carte en
vente, regarder qui diffuse. Ils se cumulent, et chacun est une adresse — « les
joueurs de Riftbound autour de Thionville » se partage plutôt que se décrit. La
pagination vit dans `?count=` au même titre, ce qui garde la page en composant
serveur.

Deux filtres ne se posent pas dans la requête Mongo parce que leur donnée n'y
est pas : un direct vit dans `stream_links`, une carte en vente dans les listes
de vente. Ils sont résolus d'abord et croisés ensuite, et « vend des cartes »
passe en dernier parce qu'il coûte une lecture par candidat.

### Ce que la recherche publique ne fait pas

Elle ne cherche **ni par identifiant ni par adresse e-mail**, à la différence de
`lib/users/admin-search.ts`. Un registre public n'a pas à confirmer qu'un
identifiant donné correspond à un compte — c'est une information qu'on vérifie,
pas qu'on cherche. Pour l'e-mail, la raison est la même en plus forte.

Elle filtre `isPublicProfile: true` **dans la requête**, jamais à l'affichage, et
sa projection ne nomme ni e-mail, ni identifiant Discord, ni amis, ni
coordonnées. La ville ne se cherche que sur les comptes qui ont accepté de la
montrer : la filtrer sur les autres la révélerait par recoupement.

### La position

Le filtre porte sur `location.city`, pas sur des coordonnées. Indexer la
position exacte des comptes la rendrait interrogeable par des inconnus, alors
qu'elle a été renseignée pour trouver des lieux proches. La commune suffit à ce
que le registre promet, et c'est un opt-in explicite (`showcase.showCity`).

## Le direct

`StreamTargetKind` gagne `"user"` — la vitrine de son propre profil. C'est la
destination la plus simple des trois : rien n'y est écrit ailleurs, le direct
étant déjà porté par la liaison elle-même. Elle n'est pas décorative pour
autant : **l'abonnement chez la plateforme n'est posé que si une liaison a au
moins une destination**, si bien que sans elle un profil n'apprendrait jamais
que son titulaire diffuse.

`canAnnounceOn` y vérifie l'égalité avec l'identifiant de la session — sans
quoi la destination « profil » permettrait d'annoncer sur celui de quelqu'un
d'autre.

## La bannière et les paliers

La bannière demande le droit `sub:profile-banner`, déclaré sur **Supporter**.
La conception l'avait placée sur Expert ; l'en-tête de
`lib/constants/subscription-plans.ts` pose que la cosmétique est le premier
palier, et que personne qui paie davantage ne doit s'en trouver privé. La placer
sur Expert l'aurait retirée aux Supporters **et** aux Pro, Pro n'incluant pas
Expert : l'inverse de ce qu'on voulait.

Un champ réservé n'est pas refusé, il est **conservé** : sans le droit, la
bannière déjà en base reste et le reste s'enregistre. Quelqu'un dont
l'abonnement s'arrête peut continuer à ranger ses blocs sans qu'on lui oppose un
mur, et sans perdre ce qu'il avait posé. C'est la règle de la personnalisation
d'un lieu, reprise ici.

## L'espace personnel

Six onglets pilotés par `?tab=` : Profil, Ma vitrine, Jeux & lieux, Succès,
Notifications, Abonnement. La rangée de boutons qui les précédait portait déjà
un commentaire disant qu'un cinquième élargirait toute la page sur un téléphone,
et il en fallait un sixième.

Sécurité, Intégrations et Mes publications restent des routes sœurs : ce sont
des écrans qu'on ouvre trois fois par an, et les mettre dans la barre
l'allongerait pour rien. On y accède depuis l'onglet Profil.

**L'onglet Profil ne règle plus rien de public.** L'avatar, la description, les
liens et la visibilité vivent dans « Ma vitrine », et nulle part ailleurs : les
tenir à deux endroits laissait retirer d'un côté ce que l'autre réécrivait. Les
éditeurs qui les portaient (`ProfileEditor`, `ProfileImageDisplay`,
`ProfileVisibilitySwitch`) ont donc disparu, avec les quatre composants que
`docs/ACCOUNT_PAGE_REDESIGN.md` documentait déjà comme morts.

Cet écran-là écrit d'un seul geste : les deux écritures — le sous-objet
`showcase` et les champs à plat — passent par une seule action, deux appels en
parallèle pouvant réussir à moitié et laisser l'aperçu dire le contraire de la
base. Il **replie** au passage `website` et `socialLinks[]` dans
`showcase.links` : sans cela, retirer un lien hérité n'aurait aucun effet, il
reviendrait au rechargement et resterait sur le profil public.

Les trois anciennes routes (`/account/achievements`, `/account/notifications`,
`/account/subscription`) **redirigent** vers leur onglet. Les deux ancres
héritées (`#jeux`, `#prices`) ne pouvaient pas l'être — un fragment d'URL n'est
jamais envoyé au serveur : les quatre liens internes sont corrigés à la source,
et `LegacyAnchorRedirect` rattrape ce qui vient du dehors.

## Ce qui n'a pas pu être fait comme dessiné

- **Les decks** n'ont ni format, ni classement, ni carte vedette stockée.
  « jeu · format » et « 2ᵉ / 64 · 142 copies » ne sont pas rendus : on dégrade
  sur le nom du jeu et la première image tirée de la liste de cartes, qui est du
  texte libre — c'est au mieux approximatif, et c'est assez pour une vignette.
- **Le troisième filtre des publications** est « Replays » et non
  « Actualités » : ce mot désigne déjà `lib/db/news.ts`, écrit par l'équipe, et
  le reprendre laisserait croire qu'un joueur publie une actualité de
  plateforme.
- **« Proposer un échange »** mène à l'écran d'échange plutôt que d'ouvrir un
  échange déjà créé : ouvrir un document à deux faces sur un clic de curiosité
  laisserait des échanges vides derrière chaque visite. C'est là qu'on invite
  par tag.
- **« Les plus actifs »** se lit « les plus récents » : le dépôt ne tient pas de
  trace d'activité par compte, et inventer un score qu'aucune donnée ne soutient
  serait pire qu'un tri honnête.

## Les index

`npx ts-node scripts/ensure-indexes-for-user-profiles.ts` pose les index des
abonnés, des publications et du registre. Le registre trie par date de création
ou par pseudonyme sur les seuls profils publics : les index portent donc le tri
à côté du critère d'égalité, sans quoi chaque page de vingt fiches se paierait
un tri en mémoire sur toute la collection.

## Vérifier

```
npm test                            # les modules purs
node scripts/check-message-parity.mjs   # les quatre locales portent les mêmes clés
node scripts/check-flex-rows.mjs    # aucune rangée flex à risque
npm run build
```
