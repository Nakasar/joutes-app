# WebMCP — outils du site pour les agents IA

Joutes déclare ses actions principales au navigateur via [WebMCP](https://webmachinelearning.github.io/webmcp/).
Un agent qui ouvre une page du site y trouve des outils décrits en langage
naturel — chercher un événement, une carte, un lieu, ouvrir une page — plutôt
que d'avoir à deviner la structure du DOM et à simuler des clics.

C'est le pendant navigateur du serveur MCP de `app/mcp` : même domaine
fonctionnel, deux publics. Le serveur MCP sert les agents qui se connectent en
HTTP avec une clé d'API ; WebMCP sert ceux qui pilotent le navigateur de
l'utilisateur, avec sa session à lui.

## Où ça vit

| Fichier | Rôle |
| --- | --- |
| `lib/webmcp/types.ts` | Typage de l'API WebMCP, absente des lib DOM de TypeScript |
| `lib/webmcp/tools.ts` | Les outils : nom, description, schéma d'entrée, exécution |
| `lib/webmcp/register.ts` | Déclaration des outils auprès du navigateur |
| `components/WebMcpTools.tsx` | Composant client monté par le layout racine ; ne rend rien |

## Les outils exposés

| Outil | Ce qu'il fait |
| --- | --- |
| `search_joutes` | Recherche globale : jeux, cartes, lieux, événements, règles et policies |
| `list_games` | Les jeux suivis par la plateforme, avec leur slug |
| `search_cards` | Catalogue de cartes d'un jeu, avec la syntaxe de filtres du site (`set:OGN`, `type:Unit`) |
| `search_events` | Événements et tournois organisés, par jeu, par mois ou autour d'un point |
| `search_lairs` | Lieux de jeu référencés (boutiques, clubs, associations) |
| `navigate_joutes` | Ouvre une page du site dans l'onglet courant |
| `get_current_page` | Adresse et titre de la page regardée par l'utilisateur |

Les outils tapent les mêmes routes `/api` que l'interface, depuis l'onglet de
l'utilisateur : la session est la sienne, ses droits aussi. Un outil ne rend
jamais plus que ce que l'utilisateur verrait lui-même, et une route qui répond
401 devient un message « connectez-vous » plutôt qu'une erreur.

## Deux API pour une seule fonctionnalité

WebMCP est un brouillon, et deux formes coexistent selon les navigateurs :

- `document.modelContext.registerTool(tool, { signal })` — la spécification.
  Un outil à la fois, retiré quand l'`AbortSignal` est déclenché.
- `navigator.modelContext.provideContext({ tools })` — l'early preview Chrome.
  Remplace d'un bloc l'ensemble des outils de la page.

`registerWebMcpTools` regarde ce que le navigateur expose et s'y adapte, sur les
deux surfaces (`navigator` et `document`, dédoublonnées si c'est le même objet).
`registerTool` est préféré quand il existe — il porte le signal de retrait ;
`provideContext` sert de repli, et le retrait s'y fait en redéclarant une liste
vide. Sur un navigateur sans WebMCP, il ne se passe rien : pas d'erreur, pas de
requête, pas une ligne de rendu en plus.

Une extension peut aussi injecter l'API après le chargement de la page : la
déclaration est donc retentée quelques fois sur les quatre premières secondes
de la page, puis abandonnée.

`registerWebMcpTools` est asynchrone et attend l'aboutissement de chaque
déclaration avant de rendre son rapport : un navigateur peut accepter l'appel
et rejeter la promesse ensuite, et conclure sur le retour synchrone laisserait
croire la page outillée alors qu'elle ne l'est pas — le repli ne serait jamais
tenté, ni la tentative suivante planifiée.

## Ce que les outils ne font pas

- **Ils ne sortent pas du site.** `navigate_joutes` n'accepte qu'un chemin
  interne commençant par `/` : ni URL absolue, ni `//hôte`, ni `javascript:`.
  Un agent ne peut pas se servir du site pour emmener l'utilisateur ailleurs.
- **Ils n'écrivent rien.** Tous sont marqués `readOnlyHint` sauf la navigation.
  Créer un tournoi ou modifier une collection reste l'affaire du serveur MCP,
  authentifié par clé d'API.
- **Ils ne parlent pas au nom de leurs résultats.** Les outils qui rendent du
  contenu écrit par des tiers (noms d'événements et de lieux, texte de cartes)
  portent `untrustedContentHint` : l'agent est prévenu qu'il lit des données,
  pas des instructions. Voir la section « Output Injection Attacks » de la
  spécification.

## Ajouter un outil

1. Écrire le schéma d'entrée et l'outil dans `lib/webmcp/tools.ts`, puis
   l'ajouter à `createJoutesWebMcpTools`.
2. La description est lue par un modèle : elle dit à quoi sert l'outil et quand
   l'appeler, pas comment il est implémenté.
3. Un outil ne lève jamais : une erreur devient un `isError: true` avec un texte
   lisible.
4. Compléter `lib/webmcp/tools.test.ts` (`npm run test`).

## Vérifier

En local, avec le serveur de développement lancé, une page chargée dans un
navigateur où `navigator.modelContext` existe doit déclarer les sept outils.

En ligne, le scanner de [isitagentready.com](https://isitagentready.com) charge
la page et regarde ce qu'elle déclare :

```bash
curl -X POST https://isitagentready.com/api/scan \
  -H "Content-Type: application/json" \
  -d '{"url": "https://joutes.app"}'
```

`checks.discovery.webMcp.status` doit valoir `"pass"`.
