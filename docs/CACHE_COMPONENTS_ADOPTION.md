# Adoption de Cache Components — état et méthode

Document de passation. L'adoption est engagée et l'infrastructure est en place ;
ce qui reste demande des arbitrages page par page.

Référence : [Migrating to Cache Components](https://nextjs.org/docs/app/guides/migrating-to-cache-components).

## Où on en est

Next 16.3.1, `cacheComponents: true` sur `main`.

| | routes |
|---|---|
| `○` entièrement statiques | 53 |
| `◐` coquille partielle | 314 |
| `ƒ` rendu à la requête | 348 |

891 pages construites. Avant l'adoption : **zéro** route avec coquille statique.

**107 pages portent encore un opt-out `export const instant = false`** — 103
marqueurs `TODO: Cache Components adoption`, plus quatre blocages assumés qui
portent une raison au lieu d'un TODO : le layout du portail organisateur de
tournoi, les deux layouts du portail d'événement, et son aiguillage `portal/page.tsx`.
Neuf pages portent un déblocage `await connection()`.

Les pages vivent sous `app/[locale]/(app)/` depuis la correction de collision de
chemins ; le groupe `(oauth2)` est à côté. Les chemins cités ici en tiennent
compte — ceux des messages de commit antérieurs, non.

## La méthode — à lire avant de toucher quoi que ce soit

Sept oracles se sont révélés menteurs au cours de l'adoption. Chacun a coûté un
aller-retour ou une régression avant d'être remplacé.

Ils ont un trait commun : **aucun ne se signale**. Ils rendent vert, ou muet, et
c'est le silence qu'on prend pour une réussite. Avant de conclure qu'une route
est adoptée, se demander laquelle de ces portes a réellement pu répondre.

### 1. Construire sur une base semée, jamais vide

Une base vide laisse passer des erreurs que la production révèle. Une page qui
lit Mongo **sans lecture liée à la requête en amont** tente un vrai prérendu, et
le pilote Mongo touche à l'horloge en chemin — mais sur une base vide, la page
sort en `ƒ` sans jamais tenter le prérendu.

Trois routes sont passées en local et ont cassé le déploiement pour cette raison
(`/admin/reports`, `/games`, `/quizz`). En semant deux documents, elles ont
échoué à l'identique en local.

**Toujours construire avec des données.**

### 2. `--debug-prerender`, sinon la liste est écourtée

```bash
npx next build --debug-prerender
```

Sans ce drapeau, le build s'arrête à la première route bloquante : on corrige,
on redéploie, la suivante tombe. Avec, la liste est complète en une passe. Une
liste vide n'a de valeur que si ce drapeau est présent.

### 3. …mais `--debug-prerender` n'est pas un build de production

Le drapeau force `NODE_ENV=development` — le build l'annonce lui-même :

    ⚠ Prerendering is running in debug mode with NODE_ENV='development'.

Il sert à **énumérer** les routes bloquantes, jamais à **valider** avant de
livrer. `/games/riftbound/tracker` est passé trois fois sous ce drapeau et a
cassé le déploiement.

Pire : un `npm run build` local, en production, passait aussi. Contre un mongod
local, le pilote ne suit pas le même chemin que vers Atlas — la lecture
d'horloge n'a lieu que dans le second cas. **Les deux portes locales étaient
aveugles à cette panne ; seul le log Vercel l'a montrée.**

```bash
gh api repos/Nakasar/joutes-app/commits/<sha>/status --jq '.statuses[]|{state,description}'
npx vercel inspect <dpl_id> --logs
```

Avant de conclure qu'une panne de déploiement vient de son propre travail,
**vérifier l'état du commit précédent**. Celle-ci était déjà là sur le commit de
restructuration.

### 4. Le glyphe ne dit pas ce qu'il y a dans la coquille — ni si elle existe

`◐` est censé dire qu'une coquille existe. Une frontière `<Suspense>` posée trop
haut passe la validation en ne prérendant que `<html><body>` : vert, sans
bénéfice.

Pire : tout le portail organisateur s'affichait `◐` alors que ses fichiers
prérendus font **0 octet**. Le glyphe ne ment pas seulement sur le contenu de la
coquille, il ment sur son existence.

```bash
ls -l ".next/server/app/fr/<route>.html"     # 0 octet = aucune coquille
```

`inspect-shells.mjs` fait la distinction (il lit la taille avant le contenu) ;
la table des routes, non.

```bash
node scripts/inspect-shells.mjs /fr/about /fr/cgu
node scripts/inspect-shells.mjs            # toutes
```

Le script distingue **aucune coquille** (route dynamique) de **coquille vide**
(le piège), et sort en erreur sur la seconde.

Le squelette d'un repli ne se juge pas non plus au nombre de caractères : il se
mesure. `EventsCalendarSkeleton` et le vrai calendrier font 1310 px tous les
deux, document total 1620 px — c'est ce qui garantit que rien ne saute.

### 5. Sous un layout bloquant, le build ne valide rien

L'opt-out d'un `layout` couvre **tout son sous-arbre** au moment du build. Une
page qui attend toujours la session passe alors sans un mot — y compris avec
`--debug-build-paths` braqué sur elle seule.

C'est le cas de tout le portail organisateur. Le seul oracle qui parle, pour ces
routes, est la validation du serveur de dev, chargement par chargement. Quand la
section est sous un layout qui porte `instant = false`, ne pas chercher de
signal du côté du build : il n'y en a pas.

### 6. Un serveur de dev qui tourne depuis longtemps ment sur son environnement

`next dev` lit `.env` **au démarrage**. S'il tourne depuis avant un changement
de base, de secret ou de variable, il répond avec l'ancien monde — sans rien
signaler.

Symptôme vécu : un `notFound()` inexplicable dans un layout tout juste écrit,
alors que la requête Mongo équivalente trouvait l'objet depuis un script. Le
serveur interrogeait encore la base précédente. Une passe entière passée à
chercher le défaut dans du code qui n'en avait pas.

**Ce qui l'a tranché en une commande** : ouvrir une page publique *qu'on n'a pas
touchée*. Elle renvoyait le même 404.

    curl -sL -o /dev/null -w "%{http_code}\n" http://localhost:3000/fr/<page-non-touchée>

Un fichier qu'on n'a pas modifié ne peut pas casser à cause de nous. S'il casse
aussi, la panne est en dessous du code — dans l'environnement. C'est le pendant
de la règle §3 : avant de s'attribuer une panne, vérifier le commit précédent ;
et ici, l'état du serveur.

Redémarrer `next dev` après toute modification de `.env` ou de la base.

### 7. Comparer la table des routes route par route

Les totaux masquent les compensations. Une bascule d'imports a fait perdre sept
coquilles statiques tout en gardant un build vert — visible seulement en
comparant chaque route à son état sur `main`.

Extraire `([○◐ƒ])\s+(/\S+)` des deux sorties de build et diffuser par clé.

### Deux pièges de mesure, pas de code

**La console accumule.** Le navigateur garde les messages d'une navigation à
l'autre dans le même onglet : une erreur lue après avoir visité trois pages peut
venir de la première. Pour attribuer une erreur à une route, **un onglet neuf
par route**. Une erreur d'hydratation a été imputée à toute l'application avant
que cette précaution soit prise ; elle ne concernait qu'une page, et ne survit
pas au build de production.

**Une route derrière une authentification ne se teste pas avec `curl`.** Sans
session, elle redirige vers `/login` : rien ne rend, donc rien n'est validé, et
l'absence d'erreur se lit comme un succès. Sept sections du portail organisateur
ont été déclarées vérifiées ainsi, à tort. Le serveur le disait pourtant :

    Could not validate `instant` because the target segment was prevented
    from rendering

**Ce message est un échec de mesure, pas un feu vert.** Corollaire : une page
qui redirige — parce que la phase n'est pas la bonne, parce que le tournoi n'a
pas démarré — échappe à la validation pour la même raison. `bracket` est passée
entre les mailles ainsi.

Vérifier ces routes demande une session ouverte dans le navigateur piloté, et
des données qui mènent au vrai rendu plutôt qu'à une redirection.

## Les pièges déjà rencontrés

Chacun a été payé une fois ; inutile de les redécouvrir.

| Piège | Symptôme | Correctif |
|---|---|---|
| **`setRequestLocale` manquant** | page de contenu pur en `ƒ` sans raison | l'appeler dans la page, pas seulement dans le layout |
| **Horloge dormante** | une page devenue statique échoue sur `Date.now()` | luxon consulte l'horloge même sur une date constante → `"use cache"` + `cacheLife("max")` (voir `formatLegalDate`) |
| **Pilote Mongo au prérendu** | `blocking-prerender-current-time` sur une page qui lit la base | `await connection()` sous le TODO prévu, si la page rendait déjà à la requête — voir ci-dessous |
| **`searchParams` attendu en tête** | toute la page sort de la coquille | transmettre la **promesse** à l'enfant sous `<Suspense>`, l'attendre là-bas (voir `EventsCalendarWrapper`) |
| **`instant` interdit en client** | `E1344` | enveloppe serveur qui rend le composant client et porte l'opt-out |
| **`Link` de next-intl** | `usePathname()` inconditionnel (`BaseLink.js:28`) | bloque toute route à segment dynamique depuis un composant client — voir ci-dessous |
| **Groupes de routes invisibles** | un test qui résout des chemins ne trouve plus rien | lire les groupes sur le disque, ne pas les énumérer (voir `api-catalog.test.ts`) |
| **`params` d'un segment non énumérable** | la page ne peut rien attendre en tête, pas même la langue | `[tournamentId]` n'est pas statiquement connu : `await params` est une lecture requête, donc `setRequestLocale` non plus n'est possible. La partie instantanée d'une telle page est un squelette sans texte — c'est normal, pas un échec |
| **Squelette écrit sans regarder l'écran** | le contenu remplace le repli et la page saute | relever les classes du vrai composant (points de rupture, `rounded-xl`, hauteurs) et comparer les repères mesurés avant/après — voir ci-dessous |

### Une lecture requête en amont désarme le piège Mongo

C'est la règle qui évite d'en faire un déploiement par route.

Une page ne tombe dans le piège du pilote Mongo que si sa **première
entrée-sortie** est une lecture de la base. Dès qu'une lecture liée à la requête
la précède — `headers()`, `cookies()`, une session, un `await searchParams` — la
page ne tente jamais le prérendu, et le piège ne se referme pas.

Sur 34 pages candidates, cinq seulement prérendent réellement (les autres ont un
segment dynamique et sortent en `ƒ`), et **une seule** avait sa lecture Mongo en
première position. Les quatre autres s'en sortent par accident :

| page | ce qui la précède |
|---|---|
| `/admin/games`, `/admin/tournaments` | `requireAdmin()` → `headers()` |
| `/games/riftbound/deck-checker` | `await searchParams` |
| `/lairs` | session → `headers()` |
| `/games/riftbound/tracker` | **rien** → c'est elle qui cassait |

Cette dépendance est fragile : déplacer un `await searchParams` sous la lecture
Mongo suffit à rouvrir le piège, sans qu'aucune porte locale ne le signale.

### Le cas du `Link` localisé

`Link` appelle `usePathname()` à chaque rendu, pour un chemin qui ne lui sert
qu'au clic. Aucune option de configuration ne l'évite (4.13.7 non plus).

Conséquence : tout composant client contenant des liens bloque les routes à
segment dynamique. **Si une route à paramètre refuse de prérender, chercher un
composant client porteur de liens avant toute autre hypothèse.**

Le layout en contient trois, et ils ont chacun leur frontière : `WebMcpTools`,
le `Header`, et le pied de page.

Corollaire pour les replis : un repli ne doit contenir **aucun `Link` localisé**,
sinon il rebloque ce que la frontière vient de débloquer (voir
`components/HeaderFallback.tsx`, `components/FooterFallback.tsx`,
`components/EventsCalendarSkeleton.tsx`, `OrganizerSkeletons.tsx` et
`PlayerSkeletons.tsx`).

#### Un bloqueur partagé se cache derrière les opt-outs

Le pied de page a été le troisième trouvé, et le plus coûteux à repérer : il
bloquait **toutes** les routes à segment dynamique, soit la majeure partie de ce
qui restait à adopter, et personne ne l'avait vu.

La raison vaut d'être retenue : tant que ces routes portaient un opt-out, aucune
n'exerçait le pied de page au prérendu. Il a fallu qu'un premier écran perde le
sien — le portail joueur — pour que le build tombe. Et la trace ne pointait pas
la page, mais `footer`.

    at div  →  at footer  →  at body  →  at html

**Une trace qui remonte au-dessus de la page désigne le layout, pas la route.**
Chercher dans la page ce qui vient du cadre fait perdre une passe entière.

La frontière est gratuite pour les routes statiques : leur chemin est connu au
prérendu, le vrai composant ne suspend pas et le repli ne s'affiche jamais. La
table des routes le confirme, identique avant et après.

### Dessiner un squelette

Un squelette ne s'invente pas, il se relève. La méthode qui a marché :

1. ouvrir le vrai écran et lire les classes du conteneur et de ses enfants —
   `getComputedStyle` et `getBoundingClientRect` depuis la console, pas le code ;
2. reprendre **les mêmes primitives**, pas une approximation : `min-w-36 flex-1`
   plutôt qu'un `grid-cols-4` qui se replie autrement, `md:grid-cols-2
   2xl:grid-cols-3` plutôt qu'un nombre de colonnes figé, `rounded-xl` si
   l'original l'est ;
3. mesurer les mêmes repères des deux côtés et les comparer.

Deux squelettes ont dû être repris pour l'avoir sauté : celui du calendrier
(tuiles sur deux colonnes au lieu de quatre) et celui des matchs de ronde, qui
ignorait la bascule Grille/Tableau et toute la colonne « À traiter ».

## Ce qui reste

Répartition des 107 opt-outs par ce qui bloque la page :

| ce que lit `page.tsx` | pages |
|---|---|
| paramètres + session + base | 46 |
| session + base | 25 |
| paramètres + base | 11 |
| base seule | 8 |
| session seule | 5 |
| rien (lecture dans un composant client) | 4 |
| paramètres seuls | 3 |
| paramètres seuls, écran client | 2 |
| écran client sans lecture | 2 |
| paramètres + session | 1 |

**Plus aucun lot mécanique n'est disponible.** Chaque route restante demande de
décider ce qui appartient à la coquille et ce qui arrive en flux.

Par zone : `games` 15, `admin` 12, `play-groups` 8, `collection` 7, `account` 7,
`news` 6, `leagues` 6, `events` 6. `games` et `news` sont publiques — donc
vérifiables sans session, et visibles par un visiteur non connecté, ce qui en
fait les plus rentables à traiter ensuite.

### Les portails, comme modèle

Deux portails adoptés — tournoi (16 sections) et événement (13) — et une seule
ligne de conduite, transposable telle quelle :

- la page ne devient **pas** `async` et transmet la promesse de `params` à un
  composant sous `<Suspense>` ;
- un `layout` porte le cadre commun et garde `instant = false` quand la zone est
  réservée — c'est le motif que la documentation Next cite comme légitime, et son
  TODO devient un commentaire de raison, pas une dette ;
- conséquence à annoncer avant de mesurer : **la table des routes ne bouge pas
  d'un glyphe et les coquilles restent à 0 octet**. Avec la porte devant, rien ne
  prérend à froid ; tout le gain est en navigation client, invisible au build
  comme à `inspect-shells.mjs`.

#### Où placer la porte d'authentification

Le portail d'événement n'avait pas de `layout.tsx` : chaque page authentifiait,
chargeait l'événement, puis réinstanciait le cadre — qui disparaissait et
revenait à chaque changement de section. Deux layouts ont été introduits, un par
rôle.

**La porte est restée dans les pages**, et c'est délibéré. Chacune redirige vers
`/login?from=…` avec **son propre chemin**, et la page de connexion consomme ce
paramètre pour ramener le visiteur là où il allait ; un contrôle dans le layout
ne connaîtrait que le chemin du layout et lui ferait perdre sa section.

Le layout ne rend alors rien de sensible par lui-même : sur un visiteur sans
droit, la redirection de la page interrompt le rendu avant que le cadre
n'atteigne le navigateur. Ça se vérifie sans cookie :

    307 → /login?from=/events/<id>/portal/organizer/standings

Corollaire : **le layout devient la première entrée-sortie de la route**. Sa
lecture en base n'a plus rien de lié à la requête devant elle, donc le piège
Mongo se referme — d'où `await connection()` dans les deux layouts. Les pages y
échappent parce que leur lecture de session vient avant.

Dernier détail : une page qui **n'aiguille que** — elle authentifie, choisit un
rôle, redirige — reste bloquante. Elle n'a pas de coquille à montrer, et les
layouts qui portent les cadres sont en dessous d'elle, pas au-dessus. Vérifié
plutôt que supposé : retirer son opt-out casse le build.

### Les écrans entièrement client

```
/events/[eventId]/join               /tournaments/[tournamentId]/timer
/friends/add/[code]                  /play-groups/[playGroupId]
/lairs/invite/[code]                 /play-groups/[playGroupId]/members
```

Leur contenu tient entièrement au paramètre d'URL, lu côté client avec
`use(params)`. L'enveloppe serveur ne sert qu'à porter l'opt-out — ou, une fois
adoptée, la frontière et sa silhouette.

**Les quatre écrans du portail joueur ont été faits ; ils servent de modèle.**
Contrairement au portail organisateur, ici le gain se voit au chargement à
froid : rien ne bloque au-dessus, donc la silhouette part vraiment dans la
coquille — de rien à ~20 Ko, avec le cadre du portail dedans.

La recette est celle de
[`blocking-prerender-current-time-client`](https://nextjs.org/docs/messages/blocking-prerender-current-time-client) :
frontière posée depuis l'enveloppe serveur, silhouette en repli. Un `<Suspense>`
global ne suffit pas s'il enveloppe un repli vide — c'est la coquille vide
contre laquelle la documentation met en garde. Il faut de **vrais squelettes**,
dessinés écran par écran et mesurés contre la vraie page.

## Ce qui a été vérifié au navigateur

Le serveur de développement refusait de démarrer tant que `app/[issuer-path]`
coexistait avec `app/[locale]` ; c'est réglé, et le navigateur est de nouveau
une porte utilisable.

- **La transition repli → en-tête réel** : vérifiée. La rangée de navigation
  garde sa place, seule la zone de compte passe par un cercle d'attente.
  `HeaderFallback` et `Header` portent le même `<header>` au caractère près et
  la même rangée `h-16` — 65 px mesurés.
- **La coquille de `/events`** : lue en servant le fichier prérendu lui-même,
  ce qui montre exactement le premier rendu. Squelette et contenu réel à 1310 px.
- **Le portail organisateur**, les seize sections ouvertes une à une dans un
  navigateur authentifié, sur un tournoi réel de 19 joueurs et 9 rondes.
- **Le portail joueur**, ses quatre écrans en 375 px, silhouette et écran réel
  comparés repère par repère : en-tête 133 px, haut du contenu 182 px, blocs de
  « mon match » à 294 / 56 / 117 / 36, barre d'onglets 70 px.
- **Le portail d'événement**, ses treize sections ouvertes une à une sur deux
  événements réels — l'un comme organisateur, l'autre comme participant. Carte de
  section à 356 px, hauteur 318, en-tête 44 et corps 200, identiques au contenu.

Reste à vérifier : les squelettes des six écrans client restants, quand ils
seront écrits.

### Voir un repli qui ne dure que quelques millisecondes

En local le flux se résout trop vite pour être capturé, et la navigation client
ne repasse même pas par le réseau quand la route a été préchargée. Deux moyens,
dans cet ordre :

1. **ralentir la section** — un `await new Promise((r) => setTimeout(r, 4000))`
   en tête du composant sous la frontière, le temps d'une capture, puis retiré ;
2. **rendre le squelette seul** — remplacer temporairement le `<Suspense>` par le
   repli, ce qui permet de mesurer ses repères et de les comparer au vrai écran.

Les deux sont des expériences locales : vérifier qu'il n'en reste rien avant de
livrer (`grep -rn "MESURE" app`).

Un préaperçu Vercel se lit avec l'en-tête `x-vercel-protection-bypass`
(le secret est côté projet, pas dans le dépôt).

## Vérifications avant de livrer

```bash
npx tsc --noEmit                      # les refontes de signature cassent en silence
npx next build --debug-prerender      # énumère les routes bloquantes
npm run build                         # le vrai build de production
npm test                              # 1008 tests
node scripts/check-flex-rows.mjs      # rangées flex à risque
node scripts/inspect-shells.mjs       # contenu des coquilles
grep -rn "MESURE" app                 # aucun ralentissement de mesure oublié
```

Et comparer la table des routes à celle de `main`, route par route.

Pour les routes derrière authentification, ajouter : **les ouvrir une à une dans
un navigateur connecté**, sur des données qui mènent au rendu et non à une
redirection. Aucune commande ne remplace ça.

Et avant d'ouvrir une session : **redémarrer `next dev` si `.env` ou la base ont
changé depuis son lancement** (§6). Une session ouverte contre un serveur resté
sur l'ancienne base est écrite dans l'ancienne base — elle n'existera pas dans
la nouvelle, et la connexion semblera échouer sans raison.

**Aucune de ces portes ne remplace le déploiement.** Après un push, lire l'état
du commit (§3) avant de considérer le travail terminé.
