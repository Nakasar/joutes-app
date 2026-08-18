# Adoption de Cache Components — état et méthode

Document de passation. L'adoption est engagée et l'infrastructure est en place ;
ce qui reste demande des arbitrages page par page, et un navigateur.

Référence : [Migrating to Cache Components](https://nextjs.org/docs/app/guides/migrating-to-cache-components).

## Où on en est

Next 16.3.1, `cacheComponents: true` sur `main`.

| | routes |
|---|---|
| `○` entièrement statiques | 53 |
| `◐` coquille partielle | 308 |
| `ƒ` rendu à la requête | 354 |

891 pages construites (222 routes × 4 langues). Avant l'adoption : **zéro** route
avec coquille statique.

**151 marqueurs `TODO: Cache Components adoption`** restants — 146 opt-outs
`export const instant = false`, 5 déblocages `await connection()` sur des pages.

Cinq PR fusionnées : #237 (drapeau + opt-outs), #239 (langue dans l'URL),
#240 (liens localisés), #241 (six pages de contenu), #242 (blocages du layout).

## La méthode — à lire avant de toucher quoi que ce soit

Trois oracles se sont révélés menteurs au cours de l'adoption. Chacun a coûté
un aller-retour ou une régression avant d'être remplacé.

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

### 3. Le glyphe ne dit pas ce qu'il y a dans la coquille

`◐` dit qu'une coquille existe. Une frontière `<Suspense>` posée trop haut passe
la validation en ne prérendant que `<html><body>` : vert, sans bénéfice.

```bash
node scripts/inspect-shells.mjs /fr/about /fr/cgu
node scripts/inspect-shells.mjs            # toutes
```

Le script distingue **aucune coquille** (route dynamique) de **coquille vide**
(le piège), et sort en erreur sur la seconde.

### 4. Comparer la table des routes route par route

Les totaux masquent les compensations. Une bascule d'imports a fait perdre sept
coquilles statiques tout en gardant un build vert — visible seulement en
comparant chaque route à son état sur `main`.

Extraire `([○◐ƒ])\s+(/\S+)` des deux sorties de build et diffuser par clé.

## Les pièges déjà rencontrés

Chacun a été payé une fois ; inutile de les redécouvrir.

| Piège | Symptôme | Correctif |
|---|---|---|
| **`setRequestLocale` manquant** | page de contenu pur en `ƒ` sans raison | l'appeler dans la page, pas seulement dans le layout — 66 pages ne l'appellent pas |
| **Horloge dormante** | une page devenue statique échoue sur `Date.now()` | luxon consulte l'horloge même sur une date constante → `"use cache"` + `cacheLife("max")` (voir `formatLegalDate`) |
| **Pilote Mongo au prérendu** | `blocking-prerender-current-time` sur une page qui lit la base | `await connection()` sous le TODO prévu, si la page rendait déjà à la requête |
| **`instant` interdit en client** | `E1344` | enveloppe serveur qui rend le composant client et porte l'opt-out |
| **`Link` de next-intl** | `usePathname()` inconditionnel (`BaseLink.js:28`) | bloque toute route à segment dynamique depuis un composant client — voir ci-dessous |

### Le cas du `Link` localisé

`Link` appelle `usePathname()` à chaque rendu, pour un chemin qui ne lui sert
qu'au clic. Aucune option de configuration ne l'évite (4.13.7 non plus).

Conséquence : tout composant client contenant des liens bloque les routes à
segment dynamique. Le `Header` et `WebMcpTools` sont derrière une frontière
`<Suspense>` pour cette raison (#242). **Si une route à paramètre refuse de
prérender, chercher un composant client porteur de liens avant toute autre
hypothèse.**

Corollaire pour les replis : un repli ne doit contenir **aucun `Link` localisé**,
sinon il rebloque ce que la frontière vient de débloquer (voir
`components/HeaderFallback.tsx`).

## Ce qui reste

Répartition des 146 opt-outs par ce qui bloque la page :

| ce que lit `page.tsx` | pages |
|---|---|
| paramètres + session + base | 66 |
| paramètres + base | 20 |
| session + base | 19 |
| paramètres seuls | 17 |
| rien dans `page.tsx` (lecture dans un composant client) | 10 |
| base seule | 5 |
| session seule | 3 |
| paramètres + session | 2 |

**Plus aucun lot mécanique n'est disponible.** Les six pages de contenu pur (#241)
et les dix opt-outs inertes (#242) étaient les derniers. Chaque route restante
demande de décider ce qui appartient à la coquille et ce qui arrive en flux.

Ordre suggéré : commencer par les 17 « paramètres seuls », les plus simples —
pousser la promesse de `params` dans un enfant sous `<Suspense>` plutôt que
l'attendre en tête de page. Les 66 du haut sont le gros morceau.

### Les dix écrans entièrement client

```
/events/[eventId]/join          /tournaments/[tournamentId]/player
/friends/add/[code]             /tournaments/[tournamentId]/player/form
/lairs/invite/[code]            /tournaments/[tournamentId]/player/players
/play-groups/[playGroupId]      /tournaments/[tournamentId]/player/standings
/play-groups/[playGroupId]/members   /tournaments/[tournamentId]/timer
```

Leur contenu tient entièrement au paramètre d'URL. Un `<Suspense>` global n'y
produirait que la coquille vide contre laquelle la documentation met en garde :
il leur faut de **vrais squelettes**, dessinés écran par écran.

**C'est le lot qui demande le navigateur** — un squelette ne se juge pas au
nombre de caractères.

## Ce qu'il faut vérifier au navigateur

Rien de ce qui suit n'a pu être vérifié : la session précédente n'avait pas
d'accès réseau depuis Chromium.

- **La transition repli → en-tête réel** (#242). Le repli reprend hauteur,
  bordure et logo, donc rien ne devrait sauter, mais personne ne l'a vu.
- **Les squelettes des dix écrans client**, quand ils seront écrits.
- **La séquence coquille → repli → contenu** sur les routes adoptées : c'est ce
  que le squelette d'adoption demande de montrer, et ce qu'aucune mesure hors
  ligne ne remplace.

Un préaperçu Vercel se lit avec l'en-tête `x-vercel-protection-bypass`
(le secret est côté projet, pas dans le dépôt).

## Vérifications avant de livrer

```bash
npx next build --debug-prerender      # 891 pages, aucune route bloquante
npm test                              # 1008 tests
node scripts/check-flex-rows.mjs      # rangées flex à risque
node scripts/inspect-shells.mjs       # contenu des coquilles
```

Et comparer la table des routes à celle de `main`, route par route.
