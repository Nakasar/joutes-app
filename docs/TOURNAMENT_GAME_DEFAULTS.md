# Réglages de tournoi par jeu (administration)

Ce dont part un tournoi selon le jeu joué : statistiques relevées, ordre de
départage, barème et scénarios proposés. Réglable depuis **Administration →
Tournois**, jeu par jeu.

## Principes

- **Le catalogue de code décrit, l'administration décide.** Les presets de
  `lib/tournaments/game-presets.ts` restent la source des *statistiques* d'un
  jeu : leurs clés sont inscrites dans les résultats déjà rapportés et dans les
  écrans de saisie des deux applications, elles ne peuvent pas se rédiger depuis
  un formulaire. Ce qui se règle en administration, c'est ce qu'on en fait par
  défaut.
- **Un réglage absent suit le format livré.** Le formulaire n'enregistre que ce
  qui s'en écarte : un barème laissé tel quel n'est pas recopié dans le
  document, et le jeu continue donc de suivre son preset si les règles
  officielles changent. C'est aussi ce qui permet de rendre un réglage au jeu en
  le remettant à sa valeur d'origine — et un formulaire qui ne s'écarte de rien
  retire le champ du document au lieu d'y laisser un objet vide : « aucun
  réglage » et « des réglages tous égaux au format livré » sont le même état.
- **Un défaut n'est pas une contrainte.** Tout ce qui est réglé ici pré-remplit
  la création d'un tournoi et de ses phases ; l'organisateur reste libre de
  modifier chaque valeur pour son tournoi.
- **Les tournois en cours ne bougent pas.** Un réglage modifié ne s'applique
  qu'aux phases créées ensuite : le classement ne lit que la phase, jamais la
  fiche du jeu, et un tournoi commencé ne peut pas changer de règles en route.

## Ce qui se règle

| Réglage | Effet |
| --- | --- |
| Format appliqué d'office | Preset de statistiques retenu pour les nouvelles phases : celui livré avec le jeu, un autre, ou aucun. |
| Saisie obligatoire | Un résultat n'est accepté qu'avec toutes les statistiques, pour chaque joueur. |
| Départage des égalités | Chaîne appliquée après les points de match, dans l'ordre (cf. `docs/TOURNAMENT_TIEBREAKERS.md`). |
| Format par défaut | Best-of, mode de résultat, appariement suisse, barème victoire / défaite / nul. |
| Scénarios disponibles | Catalogue de missions proposées aux organisateurs, une par ligne au format « Nom \| consignes ». |

## Modèle — `lib/tournaments/game-defaults.ts`

Le document de jeu porte un `tournamentDefaults` facultatif, dont chaque champ
l'est aussi. `resolveGameTournamentDefaults(slug, defaults)` empile trois
couches, de la plus faible à la plus forte :

1. les défauts de la plateforme (barème 3/0/1, best-of 1, appariement au
   classement, désignation du vainqueur) ;
2. le preset livré pour ce jeu, quand il en existe un ;
3. les réglages d'administration.

`statsPresetKey` porte trois états, et les confondre ferait suivre au jeu des
règles que personne n'a choisies :

| Valeur | Sens |
| --- | --- |
| absent | suivre le catalogue livré pour ce jeu |
| `null` | aucune statistique — l'administration a retiré le format du catalogue |
| une clé | ce preset-là |

Une clé inconnue (preset retiré d'une version à l'autre) retombe sur le
catalogue : le réglage devient caduc, il ne casse rien. Une chaîne de départage
qui porte une statistique que le preset retenu ne relève pas est filtrée par
`resolveTiebreakers` — elle ne comparerait plus que des zéros.

`presetOptionsForGame` réunit les presets déclarés pour le jeu et celui réglé en
administration s'il vient d'ailleurs : sans cette réunion, un format réglé ici
s'appliquerait aux phases sans jamais apparaître dans leur formulaire.

## Où les réglages sont consommés

- `app/tournaments/new/page.tsx` — le tunnel de création pré-remplit ses phases
  (`phaseDefaults`). Le best-of en est exclu : le tunnel le demande, et ces
  réglages s'appliquent par-dessus la réponse donnée.
- `app/tournaments/[tournamentId]/organizer/phases/page.tsx` — le formulaire de
  phase part de ces valeurs, propose les presets du jeu et son catalogue de
  scénarios.

**La chaîne de départage réglée ici est inscrite sur la phase** dès qu'elle
s'écarte du format livré. C'est nécessaire : le calcul du classement ne lit que
la phase et son preset, jamais la fiche du jeu. Sans cette inscription, une
chaîne réglée en administration s'évaporerait au premier calcul — et un
tournoi en cours changerait de règles le jour où l'administration touche au jeu.

## Interface

- `app/admin/tournaments/page.tsx` — la liste des jeux, l'état de chacun (format
  retenu, nombre de critères, nombre de scénarios). Les jeux qui ouvrent les
  tournois passent devant.
- `app/admin/tournaments/[gameId]/page.tsx` — l'éditeur. Les libellés des
  critères et des statistiques sont ceux que l'organisateur lit dans son
  formulaire de phase : ils existent déjà dans les quatre langues, et un
  administrateur qui règle « score de bataille » doit retrouver le même mot à
  l'écran de configuration d'un tournoi.
- `app/admin/tournaments/GameTournamentDefaultsForm.tsx` — le formulaire.

## Tests

```bash
npm run test
```

- `lib/tournaments/game-defaults.test.ts` — réglage muet contre réglage posé,
  `null` contre absent, preset disparu, départage écarté par changement de
  format, réunion des presets proposés.
