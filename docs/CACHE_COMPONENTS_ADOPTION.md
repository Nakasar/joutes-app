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

**6 pages portent encore un opt-out `export const instant = false`** : 1 avec
un marqueur `TODO: Cache Components adoption`, et 5 blocages assumés qui portent
une raison à la place — le layout du portail organisateur de tournoi, les deux
layouts du portail d'événement, son aiguillage `portal/page.tsx`, et le
vérificateur de deck de Riftbound, dont les métadonnées lisent `?input=` pour
composer l'image de partage.

**Attention en comptant : les marqueurs `TODO` ne comptent pas les opt-outs.**
Ils marquent aussi les déblocages `await connection()`, qui n'ont rien à voir.
Il y en a 4 en tout pour 1 opt-outs marqués. Les deux commandes qui donnent
les vrais chiffres :

```bash
# les opt-outs, et ceux d'entre eux qui sont des blocages assumés
grep -rl 'instant = false' app/ | wc -l
comm -23 <(grep -rl 'instant = false' app/ | sort) \
         <(grep -rl 'TODO: Cache Components adoption' app/ | sort)
```

51 pages portent un déblocage `await connection()` — le piège Mongo est devenu
la contrainte la plus fréquente sur ce qui reste.

Les pages vivent sous `app/[locale]/(app)/` depuis la correction de collision de
chemins ; le groupe `(oauth2)` est à côté. Les chemins cités ici en tiennent
compte — ceux des messages de commit antérieurs, non.

## La méthode — à lire avant de toucher quoi que ce soit

Huit oracles se sont révélés menteurs au cours de l'adoption. Chacun a coûté un
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

### 8. Un `not-found.tsx` fait partie de la coquille de tout son sous-arbre

**Ce piège a coûté une conclusion fausse, écrite dans ce document même.**

Constat : les onze pages d'outils de jeu sortaient une coquille de 4 321 octets
— le seul cadre de l'application, sans rien de la page — alors que les pages
d'actualités, découpées exactement pareil, en sortaient 17 500 avec leurs
silhouettes. J'en ai d'abord conclu qu'une silhouette de page ne pouvait pas
tenir dans la coquille d'une route à segment dynamique. C'était faux.

La cause était dans `games/[gameSlugOrId]/not-found.tsx`, un fichier que je
n'avais jamais ouvert. Il contenait deux `Link` localisés. **Next prépare la
limite `not-found` dans la coquille de chaque route du sous-arbre**, même quand
aucune n'échoue : ces deux liens lisaient le chemin courant — inconnu au
prérendu d'une route à segment dynamique — et suspendaient les onze coquilles.

Mesuré sur la galerie de cartes, même build, seul ce fichier changeant :

| `not-found.tsx` | coquille |
|---|---|
| avec `Link` localisé | 4 321 o, silhouettes absentes |
| sans | 18 522 o, silhouettes comprises |

**Une frontière `<Suspense>` autour des liens ne suffit pas** — vérifié : Next
prérend ce fichier hors du contexte de la page, et la frontière n'y arrête rien.
Il faut que le `Link` disparaisse. Les `<a>` coûtent une navigation complète et
un aller-retour par le proxy pour retrouver la langue, que le cookie porte ; sur
un écran d'erreur, c'est sans conséquence.

Corollaire, à vérifier avant de conclure quoi que ce soit sur une coquille
maigre : **`not-found.tsx`, `error.tsx` et `loading.tsx` d'un segment comptent
dans la coquille de tout ce qui est en dessous.** La règle du `Link` localisé
s'y applique comme aux replis.

**Le piège s'est reproduit à l'identique** sur `lairs/[lairId]/not-found.tsx`,
une passe plus tard, sur une zone sans rapport. Le balayage se fait en une
commande — à passer avant de toucher une zone :

```bash
for f in $(find app -name "not-found.tsx" -o -name "error.tsx" \
                 -o -name "loading.tsx" -o -name "global-error.tsx"); do
  grep -q 'from "@/i18n/navigation' "$f" && echo "⚠ $f"
done
```

Il restait deux fichiers concernés au moment de ce balayage : celui des lieux et
celui des profils.

### Trois pièges de mesure, pas de code

**La console accumule.** Le navigateur garde les messages d'une navigation à
l'autre dans le même onglet : une erreur lue après avoir visité trois pages peut
venir de la première. Pour attribuer une erreur à une route, **un onglet neuf
par route**. Une erreur d'hydratation a été imputée à toute l'application avant
que cette précaution soit prise ; elle ne concernait qu'une page, et ne survit
pas au build de production.

**Un onglet dont le socket HMR est mort montre un état figé.** Après un
redémarrage de `next dev`, l'onglet resté ouvert continue de répondre, mais son
flux ne se termine plus : il affiche indéfiniment les silhouettes, comme si le
contenu ne venait jamais. La page des produits d'un jeu a été prise pour une
régression à ce titre — le serveur diffusait pourtant bien son écran d'erreur,
et un onglet neuf l'affichait correctement.

Le signe est dans la console : `WebSocket connection to '.../_next/hmr' failed`,
répété. **Rouvrir un onglet, pas recharger celui-ci.** C'est le même réflexe que
pour la console qui accumule, et pour la même raison : l'onglet est un état, pas
une mesure.

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

**Une frontière `<Suspense>` ne le désarme pas.** C'est de la sync-IO, pas une
donnée de requête : le mécanisme qui met le contenu en flux n'y change rien.
Séquencer la session avant la lecture Mongo, plutôt que de les lancer ensemble
en `Promise.all`, ne suffit pas non plus — vérifié sur la page d'une actualité.
Seul `await connection()` le désarme.

**Et il faut le désarmer deux fois** quand `generateMetadata` lit la même base.
Les métadonnées s'exécutent hors de la frontière de la page, avec leur propre
lecture, donc leur propre passage du pilote sur l'horloge. Un `connection()`
dans le corps laisse celui des métadonnées armé — c'est ce qui restait allumé
sur `/news/[newsId]` après avoir cru l'avoir corrigé.

### `setRequestLocale` se pose à deux endroits, pas un

Le document disait « l'appeler dans la page ». C'est insuffisant :
`generateMetadata` s'exécute hors de la portée de l'appel fait dans le corps de
la page. Sans son propre `setRequestLocale`, `next-intl` y relit la langue à la
requête et rend toute la route dynamique — quoi que fasse le corps.

Le symptôme est un `blocking-prerender-runtime` sur une page dont le corps est
pourtant irréprochable. Vérifié sur `games/[gameSlugOrId]/page.tsx`.

**Et il en faut un dans toute page qui garde un `Link` localisé hors frontière.**
L'appel du layout ne porte pas jusque-là : layout et page rendent chacun de leur
côté. Un `Link` laissé dans la coquille compose son adresse avec la langue, que
next-intl relit alors à la requête — et toute la route redevient dynamique. La
trace désigne `i18n/request.ts`, jamais le `Link`. Vu sur `/news/create` et
`/quizz/create`, dont le seul lien statique est le bouton de retour.

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

### Un squelette seul à l'écran doit s'annoncer

`aria-hidden` sur un squelette part d'une bonne intention — des rectangles gris
n'ont rien à dire — mais quand le squelette est **le seul contenu de l'écran**,
il ne reste rien du tout à annoncer : la synthèse vocale se tait pendant tout le
chargement.

La règle retenue :

- **Silhouette qui occupe seule sa frontière** → `role="status"`,
  `aria-busy="true"`, et un `<span className="sr-only">` qui nomme ce qui
  arrive. Les rectangles n'ont pas besoin d'`aria-hidden` : un `<div>` vide ne
  produit déjà aucune sortie.
- **Placeholder posé à côté d'un contenu réel** — une barre à la place d'un
  titre, un bouton de retour — → il reste décoratif, `aria-hidden`.

Corollaire : **ne pas imbriquer deux régions `status`**, elles annoncent deux
fois. Une silhouette composée passe son intitulé à celle qu'elle contient
(`EditorFormSkeleton` accepte un `label`) plutôt que d'en ajouter une autour.

## Le verrou du layout racine — levé

**Presque tout ce qui restait était bloqué par une seule ligne, et elle n'était
dans aucune des pages.** Tant qu'elle était là, travailler une route à segment
dynamique ne servait à rien : elle ne prérendait pas, quoi qu'on fasse dans son
fichier.

La ligne était dans `app/[locale]/(app)/layout.tsx` :

```tsx
const { locale } = await params;
```

La section garde le diagnostic complet : il explique la forme actuelle du
layout, et il évite de refaire les mêmes essais.

### Pourquoi ça ne casse que les routes à segment dynamique

Sous Cache Components, `dynamicParams` est **interdit** — le build le refuse
explicitement :

```
Route segment config "dynamicParams" is not compatible with
`nextConfig.cacheComponents`. Please remove it.
```

Toute route à segment dynamique a donc forcément une *coquille d'application* :
la page servie instantanément quand le paramètre n'était pas connu au build,
remplacée en arrière-plan une fois le paramètre résolu. Dans cette coquille,
**aucun paramètre n'est résolu — pas même `[locale]`**. Y lire la langue, c'est
lire une donnée de requête.

Sur `/games` ou `/games/riftbound/tracker`, il n'y a pas de segment dynamique
sous `[locale]` : pas de coquille de repli, la langue est connue, la page sort
en `○`. C'est exactement ce qui a masqué la cause pendant deux sessions — les
pages qui passaient et celles qui bloquaient ne différaient que par là.

### La trace ne le dit pas

Elle désigne `<NextIntlClientProvider>`, une vingtaine de lignes plus bas, avec
« Show 13 ignore-listed frames » et aucune frame applicative. `next-intl` n'y
est pour rien. Le seul moyen de le prouver a été de bissecter : remplacer
`await params` par une langue en dur suffit à rendre le rendu propre.

**Règle générale à en tirer :** quand la trace ne nomme qu'un élément JSX du
layout racine sans aucune frame applicative, elle désigne l'endroit où React a
attribué l'erreur, pas la lecture fautive. Bissecter le layout ligne à ligne
est plus rapide que d'interpréter la trace.

### Ce qui a été essayé, et qui ne marche pas

| piste | résultat |
|---|---|
| `generateStaticParams` depuis les slugs en base | génère bien les 28 chemins, la coquille bloque quand même |
| `dynamicParams = false` | interdit sous Cache Components |
| `next/root-params` (l'API prévue pour ça, Next 16.3) | bloque aussi |
| ce même appel enveloppé dans `"use cache"` | bloque aussi |
| props explicites (`locale`, `messages`) sur `NextIntlClientProvider` | hors sujet, ce n'était pas lui |
| `<Analytics />` sous frontière | hors sujet également |

Ne pas les retenter sans nouvelle information : chacun a été vérifié au build
**et** au navigateur.

### Ce que sa levée débloquerait

Mesuré en neutralisant la lecture dans le layout, puis en construisant
`games/[gameSlugOrId]/rules` sans opt-out :

```
├ ○ /en/games/mtg/rules      ← les 28 chemins concrets : statiques
└ ◐ [+30 more paths]         ← la coquille de repli
```

Le lot complet, sans rien changer d'autre. Ce seul `await params` bloque **la
totalité des routes à segment dynamique restantes**.

### Le déplacement du layout : piste écartée

Le layout racine est dans le groupe `(app)`, sous `app/[locale]/`. L'hypothèse
était que Next n'énumérait pas correctement `[locale]` pour les coquilles à
cause de cette position. Testé dans les deux variantes, avec `next typegen`
rejoué entre les deux : `app/[locale]/layout.tsx` avec `await params`, puis avec
`next/root-params`. Les deux bloquent. Ne pas y revenir.

### La sortie : une coquille indépendante de la langue

Le layout ne lit plus la langue du tout. Il ne rend que ce qui se prérend sans
elle — structure du document, polices, thème — et passe le reste derrière une
frontière :

```tsx
<html suppressHydrationWarning>          {/* plus de lang ici */}
  <body className={…}>
    <ThemeProvider …>                    {/* ne dépend pas de la langue */}
      <Suspense fallback={<AppFrameFallback />}>
        <LocalizedFrame>{children}</LocalizedFrame>
      </Suspense>
```

`LocalizedFrame` lit la langue via `next/root-params`, appelle
`setRequestLocale`, et rend `NextIntlClientProvider` avec tout le cadre
localisé. L'attribut `lang`, lui, ne peut pas attendre une frontière : il est
posé par un `<script>` d'une ligne rendu depuis `LocalizedFrame`.

**Ce que ça ne coûte pas.** Une frontière ne suspend que si quelque chose
suspend réellement. Sur une route sans segment dynamique, la langue est connue :
`LocalizedFrame` rend d'un trait et son contenu atterrit dans le HTML statique.
Vérifié — `/fr/games.html` fait 235 690 o après la bascule, contre 223 738 o
avant. Rien n'est dégradé.

**Ce que ça coûte, précisément.** `lang` est absent à l'analyse du document. Il
est posé avant tout rendu visible, donc les lecteurs d'écran et les moteurs qui
exécutent JavaScript le voient. Ceux qui ne l'exécutent pas voient une langue
**non déclarée**, pas une langue fausse.

Deuxième coût, plus discret : sur une route à segment dynamique, même un chemin
énuméré par `generateStaticParams` ne prérend plus son contenu localisé — il
part en flux derrière la silhouette. `◐` au lieu du `○` qu'on aurait eu si la
langue n'était pas lue du tout. C'est le prix de la coquille partagée.

### Avant / après, mesuré

| fichier prérendu | avant | après |
|---|---|---|
| `/fr/games.html` (sans segment dynamique) | 223 738 o | 235 690 o |
| `/fr/games/[gameSlugOrId]/rules.html` | **0 o** | **4 236 o** |
| `/fr/games/[gameSlugOrId]/rules/[documentId].html` | **0 o** | 5 156 o |

Sur les routes à segment dynamique, on passe de *rien de prérendu du tout* à
*le cadre prérendu, le contenu en flux*. C'est exactement l'objectif de
l'adoption.

### Ce que la coquille contient, mesuré

Deux formes de coquille, selon la route :

| route | coquille |
|---|---|
| sans segment dynamique (`/news`, `/quizz`) | la page prérendue, titre et accroche compris — 32 Ko |
| avec segment dynamique (`/news/[newsId]`, outils de jeu) | le cadre plus les silhouettes de la page — 18 Ko |

Sur une route à segment dynamique, le contenu localisé part toujours en flux :
`{children}` est rendu sous `LocalizedFrame`, qui suspend là (voir « Le verrou du
layout racine »). Mais **les silhouettes, elles, tiennent dans la coquille** —
à condition qu'aucun `Link` localisé ne traîne dans la page, ses replis, ou les
fichiers de limite du segment.

### Sur une route à segment dynamique, rien de localisé ne tient dans la coquille

La chaîne se referme sur elle-même :

1. afficher du texte traduit, ou un `Link` localisé, demande `setRequestLocale` ;
2. `setRequestLocale` demande la langue ;
3. obtenir la langue demande `await params` ;
4. `await params` est une lecture de requête sur une route à segment dynamique.

**Donc la page ne peut garder devant que du muet** : ses conteneurs et ses
silhouettes. Toute tentative de laisser un titre traduit ou un bouton de retour
dans la coquille fait retomber la page entière derrière la frontière du cadre.

Mesuré sur `lairs/[lairId]/manage` et `lairs/[lairId]/events/new` : **4 236 et
5 156 octets** avec l'en-tête traduit devant — le seul cadre de l'application —
contre **17 832 et 17 839** une fois l'en-tête passé derrière une frontière et
remplacé par une silhouette.

Corollaire : sur ces routes, un bouton de retour n'a pas à rester devant « parce
qu'il ne tient qu'à l'identifiant d'URL ». Il est localisé, donc il coûte la
coquille entière. Il vaut mieux une silhouette de bouton, et le vrai bouton avec
le flux.

Sur une route **sans** segment dynamique, la chaîne ne se referme pas :
`await params` y est statique, et le titre traduit reste bien dans la coquille —
c'est ce qui donne les 33 Ko de `/news`, `/quizz`, `/leagues` et `/lairs`.
## Ce qui reste

Répartition des opt-outs par ce qui bloque la page :

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

**Il ne reste qu'une page à adopter**, et ce sont les sept plus grosses de
l'application :

| page | lignes |
|---|---|
| `events/[eventId]` | 474 |

Chacune demande sa propre passe : ce sont des écrans composés de plusieurs
sections aux dépendances différentes, où le découpage se décide section par
section plutôt qu'au gabarit.

### Le portail d'un jeu, comme modèle pour les six autres

C'est la première de ces grosses pages à être passée, et sa forme se
généralise. Trois dépendances s'y croisaient, et les mélanger faisait attendre
le tout à la plus lente :

| dépendance | sections | ce qu'elle coûte |
|---|---|---|
| le jeu seul | héros, présentation, outils, communauté | une lecture en cache — quasi immédiat |
| la session | les boutons Suivre et Favori | session, puis lecture du compte |
| une seconde lecture en base | actualités, agenda des lieux | une requête chacune |

Deux décisions valent d'être reprises ailleurs :

- **La frontière des boutons de suivi est *dans* le héros**, pas autour de lui.
  Le nom du jeu n'a aucune raison d'attendre l'identité du visiteur.
- **Une seule section s'annonce.** Cinq silhouettes chargent en même temps ; si
  chacune portait `role="status"`, une synthèse vocale débiterait cinq
  « Chargement de… » d'affilée. Le héros parle au nom de la page, les autres
  sont décoratives.

Le fond du repli est sombre, comme l'écran : le portail est le seul de
l'application à l'être, et des rectangles clairs y auraient éclairé la page
avant de disparaître.

Coquille : **20 610 octets**, contre 18 289 sur `main` — soit le cadre de
l'application seul. La différence est faible en octets et grande à l'écran :
c'est la page entière qui apparaît d'un coup au lieu de rien.

### La page d'un lieu : quand la porte dépend de la donnée

Deuxième grosse page, et elle a posé un cas que les autres n'avaient pas : **un
lieu privé ne doit rien montrer avant la vérification d'accès, pas même son
nom** — mais on ne sait qu'il est privé qu'après l'avoir lu.

Mettre la porte en tête de page aurait fait lire la session avant tout
affichage, y compris pour les lieux publics, qui sont la majorité. La forme
retenue met la décision dans la lecture elle-même :

```tsx
const requireVisibleLair = cache(async (lairId: string) => {
  const lair = await getLairById(lairId);
  if (!lair) notFound();
  if (!lair.isPrivate) return lair;        // public : rien d'autre à attendre
  // privé seulement : session, suivi, droits de gestion
});
```

Un lieu public s'affiche dès sa lecture ; un lieu privé attend sa porte, et n'a
alors rien montré. **La règle générale se précise : ce n'est pas « la porte
devant » ou « la porte derrière », c'est la porte au niveau où la donnée dit
qu'elle est nécessaire.**

Coquille : **19 206 octets**.

### Toutes ne se découpent pas — et c'est une décision, pas un abandon

La fiche d'une carte et la page d'une ligue ont été traitées ensemble, et elles
ont appelé deux réponses opposées.

**La fiche d'une carte se découpe.** Sa rangée de navigation ne tient qu'au jeu,
lu en cache, quand le corps demande la carte, ses errata, les cartes qu'ils
mentionnent, les droits du visiteur et sa collection. Et l'appartenance sociale
— ce que les amis et les groupes possèdent — coûte une lecture par propriétaire
pour un simple complément : elle part sous sa propre frontière, sans silhouette,
puisque lui réserver sa place laisserait un trou à qui n'a ni amis ni groupe.
Coquille : **20 815 octets**.

**La page d'une ligue ne se découpe pas**, et c'est délibéré : *toutes* ses
sections dépendent de la session. Le classement en dépend pour savoir qui lit,
les boutons Rejoindre et Quitter évidemment, les tournois pour les droits
d'organisation. Quatre frontières auraient attendu la même chose au même moment,
pour quatre silhouettes au lieu d'une. Coquille : **17 976 octets**.

**La question à se poser sur les trois pages restantes** n'est donc pas « où
couper », mais : *ces sections attendent-elles des choses différentes ?* Si la
réponse est non, une frontière suffit, et le commentaire doit dire pourquoi —
sans quoi la prochaine passe croira à un oubli.

### Sortir ce que presque personne ne voit

Le profil public a confirmé un motif qui s'était déjà présenté sur la fiche
d'une carte, et qui vaut d'être cherché systématiquement : **une portion
d'écran qui coûte cher et que presque personne ne voit**.

Ici, trois boutons réservés à l'administration coûtaient trois lectures — droits,
catalogue complet des succès, abonnement brut — sur le chemin critique de
*chaque* visiteur du profil. Sous leur propre frontière, ils ne coûtent plus
rien à personne d'autre.

Ces portions se reconnaissent à deux traits : elles sont **conditionnelles**
(`{isAdmin && …}`, `{userId && …}`) et **coûteuses**. Elles partent sous
frontière **sans silhouette** : leur réserver une place déplacerait la mise en
page pour la majorité qui ne les verra jamais.

Coquille du profil : **18 585 octets**.

### Un identifiant inventé est un mauvais oracle

Balayer une route à segment dynamique avec un identifiant qui n'existe pas —
`/decks/d1`, `/wishlists/w1` — ne prouve pas grand-chose : **une requête qui ne
trouve rien ne déclenche pas toujours le piège Mongo.** Le pilote n'a pas besoin
d'aller assez loin pour toucher à l'horloge.

C'est ainsi que neuf `generateMetadata` sont passés entre les mailles pendant
plusieurs passes : leurs pages étaient « vertes » au balayage, avec des
identifiants inventés. Le piège n'est apparu que sur une page testée avec une
vraie ligue.

La liste se sort en une commande, et vaut mieux que le balayage :

```bash
# les métadonnées qui lisent la base sans avoir désarmé le piège
for f in $(find app -name page.tsx); do
  awk '/^export async function generateMetadata/,/^}/' "$f" > /tmp/mb
  grep -qE 'get[A-Z]|db\.collection' /tmp/mb && ! grep -q 'await connection()' /tmp/mb \
    && echo "$f"
done
```

**Attention en l'appliquant** : le déblocage n'a de sens que là où la lecture
touche vraiment Mongo. Posé sur `/cgu` et `/privacy`, dont les métadonnées ne
lisent qu'un document statique, il a rendu leurs routes dynamiques et fait
apparaître une erreur `uncached data` qui n'existait pas. Les deux ont été
remises en l'état. Le balayage donne des candidats, pas des corrections.

Toutes les autres zones sont faites. Les cinq opt-outs restants sont les
blocages assumés.

**Le motif est stabilisé**, et il tient en trois formes :

| forme de route | ce que la coquille contient | ordre de grandeur |
|---|---|---|
| publique, sans segment dynamique | l'en-tête traduit, prérendu | ~33 Ko |
| derrière une porte, sans segment dynamique | le cadre et la silhouette | ~30 Ko |
| derrière une porte, avec segment dynamique | le cadre et la silhouette | ~18 à 20 Ko |

La règle retenue partout pour ce qui est derrière une porte : **rien de ce que
la porte protège** ne s'affiche avant sa réponse, pas même le nom de l'objet, ni
la mise en page d'un espace personnel.

### Une porte au niveau du layout couvre tout, y compris les pages

L'administration a montré le cas le plus net. Sa porte est dans son `layout` :
posée hors frontière, elle bloquait le prérendu des douze écrans ; posée sous
frontière, elle laisse une coquille — mais `{children}` passe alors derrière
elle, et **les pages n'ajoutent plus rien à cette coquille**.

C'est un échange assumé : personne ne doit voir l'ombre d'un écran
d'administration avant que la porte ait répondu, pas même sa mise en page. Le
gain reste net — de rien à ~30 Ko de cadre et de silhouette.

Conséquence pratique : sous un tel layout, **retirer l'opt-out d'une page suffit
souvent**. Ses lectures suspendent à la frontière du layout au lieu de bloquer.
Les dix pages d'administration n'ont demandé aucune autre modification.

Les zones qui restent sont toutes derrière une session. Ce sont donc celles où
les pièges de mesure comptent le plus : ni `curl`, ni onglet recyclé.

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
