# Sitemaps

Ce que la plateforme déclare aux moteurs de recherche. Deux sitemaps, annoncés
tous deux par `robots.txt` (`lib/well-known/robots.ts`) :

| Adresse | Contenu |
| --- | --- |
| `/sitemap.xml` | les pages de la plateforme, et **les pages de chaque jeu** |
| `/sitemap_index.xml` | l'index : le sitemap principal, et un sitemap de cartes par tranche de 10 000 |
| `/sitemaps/{slug}---{n}.xml` | les cartes d'un jeu, 10 000 par tranche |

## Principes

- **On ne déclare que ce qui existe.** Un fanion allumé ouvre une page, et c'est
  cette page qu'on annonce. Une adresse qui répondrait 404 vaut moins que pas
  d'adresse du tout : un sitemap est une promesse faite au moteur.
- **On ne déclare que ce qui se lit sans compte.** La collection d'un jeu figure
  dans sa barre d'outils, mais elle est personnelle — elle n'a rien à faire dans
  un index public.
- **On ne déclare pas une page vide.** Les quiz et l'actualité ne dépendent
  d'aucun fanion : on regarde s'il y a du contenu plutôt que d'envoyer un moteur
  sur une liste vide.
- **Les pages d'un jeu ne s'écrivent pas à la main.** Elles se déduisent de ses
  fonctionnalités, comme sa barre d'outils. La liste fixe d'avant ne décrivait
  que riftbound : les autres jeux n'existaient pour un moteur que par les liens
  qui pointaient vers eux, et les pages qu'aucune barre d'outils ne pointe (les
  quiz, l'actualité) n'existaient pour personne.

## Pages déclarées pour un jeu — `lib/games/sitemap.ts`

| Page | Condition |
| --- | --- |
| `/games/{slug}` | toujours |
| `/games/{slug}/cards` | fanion `cards` |
| `/games/{slug}/loop`, `/scanner` | fanion `cards` — la barre d'outils les propose sous le même |
| `/games/{slug}/rules` + `/rules/tr` + `/rules/cr` | fanion `rules` |
| `/games/{slug}/policies` | fanion `policies` |
| `/games/{slug}/cubes` | fanion `cubes` |
| `/games/{slug}/products` | fanion `products` |
| `/games/{slug}/quizz` | le jeu a au moins un quiz |
| `/games/{slug}/news` | le jeu a au moins une actualité |

Les conditions suivent celles de `components/games/GameToolsNavBar.tsx` : un
outil déclaré ici sans être proposé là promettrait une page que le jeu ne montre
pas.

Restent **hors** de cette table, à dessein :

- la **collection** (`/collection/{slug}`) — personnelle, elle demande un compte ;
- le **vérificateur de deck** — son fanion existe pour tous les jeux, mais sa
  page n'existe que pour riftbound (`app/games/riftbound/deck-checker`, sans
  équivalent sous `[gameSlugOrId]`). Il reste déclaré à la main dans la route
  tant qu'il n'est pas générique, plutôt que d'annoncer un 404 à tous les
  autres jeux ;
- les **espaces développeurs** de riftbound, routes statiques elles aussi.

Un jeu **sans slug** n'est pas déclaré : ses pages répondent aussi sous son
identifiant, mais une adresse technique n'a pas à devenir l'adresse canonique
d'un jeu dans un index public.

## Modules

- `lib/games/sitemap.ts` — quelles pages pour quel jeu. Module pur : la route
  lui passe ce qu'elle a lu et préfixe les chemins de son domaine, ce qui rend
  la règle testable sans base.
- `app/sitemap.xml/route.ts` — les pages de la plateforme, écrites à la main, et
  celles des jeux, calculées. Deux `distinct` (quiz, actualités) disent quelles
  pages ont du contenu.
- `app/sitemap_index.xml/route.ts` — l'index et le découpage des cartes.
- `app/sitemaps/[sitemapId]/route.ts` — une tranche de cartes.

## Tests

```bash
npm run test
```

- `lib/games/sitemap.test.ts` — un outil par fanion, cartes et leurs
  manipulations, documents de règles, quiz et actualité seulement s'il y a du
  contenu, collection et vérificateur de deck écartés, jeu sans slug ignoré,
  et pas deux fois la même adresse.
