# L'affiche des événements d'un lieu

## Vue d'ensemble

Un lieu génère depuis son écran de gestion une **affiche A4 portrait** de ses
événements, prête à publier sur ses réseaux ou à imprimer : la semaine ou le
mois, dans l'un de sept styles. L'affiche est une page à part entière,
`/lairs/[lairId]/affiche`, que l'écran de gestion montre en aperçu et ouvre
pour l'impression.

Les maquettes qui ont fixé les styles sont sous `design/affiche-evenements/`.

## La page de l'affiche

`app/[locale]/(poster)/lairs/[lairId]/affiche/page.tsx`, dans un groupe de
routes à part : une page nue, sans en-tête ni pied de site, avec son propre
layout qui charge les polices des sept styles (`next/font`) et la feuille
`components/posters/poster.css`. Visible par quiconque voit le lieu — un lieu
privé garde ses règles — puisque c'est un document à partager.

| Paramètre | Valeurs | Rôle |
| --- | --- | --- |
| `period` | `week` (défaut), `month` | La semaine (lundi → dimanche) ou le mois qui contient `start`. |
| `start` | `AAAA-MM-JJ` | N'importe quel jour de la période ; aujourd'hui par défaut. |
| `style` | une clé de `POSTER_STYLE_KEYS` | Par-dessus le style enregistré. |
| `attendance` | `0` / `1` | Par-dessus « afficher la fréquentation ». |
| `logos` | `0` / `1` | Par-dessus « logos des jeux ». |
| `print` | `1` | Ouvre la boîte d'impression une fois les polices chargées. |

Les trois paramètres de réglage existent pour l'aperçu de l'écran de gestion :
il montre un réglage avant qu'il soit enregistré. Le contrôle Pro s'applique
aux deux chemins (`resolvePosterStyle`).

Ce qui se calcule se calcule une fois, dans `components/posters/Poster.tsx` :
la fenêtre (`lib/posters/period.ts`), les groupes par jour ou par semaine, les
libellés et les chaînes formatées (`lib/posters/format.ts`), le QR code vers
la page du lieu (`qrcode`, en SVG). Un style (`PosterStyles.tsx`) ne fait que
poser des balises et des classes.

## Les sept styles

`lib/posters/styles.ts` est le registre : la clé stockée, le verrou Pro et les
trois couleurs du sélecteur. Le rendu vit dans `poster.css`, une classe par
style sur `.poster`.

| Clé | Style | Accès |
| --- | --- | --- |
| `joutes` | Joutes — fond sombre, bandeau au dégradé de l'en-tête, cartes par jour | tous |
| `board` | Tableau d'affichage — liège, post-it, écriture manuscrite | tous |
| `tournament` | Tableau de joutes médiévales — parchemin, bannières héraldiques | tous |
| `cyberpunk` | Néons cyan et magenta, panneaux à coins coupés | Joutes Pro |
| `tavern` | Bois, enseigne suspendue, parchemin déroulé | Joutes Pro |
| `scifi` | Journal de mission clair, modules à équerres | Joutes Pro |
| `grimoire` | Cuir, page vieillie, rubriques rouges, sceau | Joutes Pro |

Un style Pro demandé par un lieu qui ne l'est plus retombe sur `joutes` au
rendu : un abonnement arrêté ne casse pas une affiche déjà partagée.

## Les réglages du lieu

Sous `lair.options.poster` (`LairPosterSettings`) :

- `style` — la clé du style ;
- `showAttendance` — les places restantes et la mention « complet ». Éteint,
  le prix reste ;
- `gameLogos` — les logos des jeux (`game.images.icon`), le nom prenant le
  relais quand un jeu n'en a pas. Éteint, le nom seul, partout.

Les deux interrupteurs sont des classes sur la racine (`sans-freq`,
`jeux-noms`) : chaque style rend les deux formes, la classe décide de celle
qui se voit. L'action `updateLairPosterSettings`
(`manage/poster-actions.ts`) refait le contrôle Pro et refuse un style
réservé à un lieu non abonné (`PRO_REQUIRED`).

## L'écran de gestion

Onglet **Affiche** (`?tab=poster`), `LairPosterSettings.tsx` : la période et
sa navigation, les deux interrupteurs, le sélecteur de style avec le verrou
Pro, l'aperçu — une `iframe` de la vraie page, réduite —, et l'export.

L'export passe par le navigateur : **Imprimer ou enregistrer en PDF** ouvre
l'affiche avec `print=1`. Le format d'impression est fixé à l'A4 sans marge
(`@page`), et l'affiche est dessinée à 794 × 1123 px, soit 210 × 297 mm à
96 dpi : elle sort à l'échelle. Il n'y a pas d'export PNG direct : il
demanderait un moteur de rendu côté serveur ou une dépendance de
rastérisation, et le PDF se convertit sans perte.

## Ce qui est décidé, et ce qui reste ouvert

- Le mois liste chaque semaine ; un mois très chargé déborde de la page,
  l'affiche coupant ce qui dépasse. Une seconde page ou des lignes plus
  courtes seront à prévoir si le cas se présente.
- Le format A4 déborde du 4:5 d'Instagram ; un format story pourra venir
  ensuite.
- Les événements annulés ne figurent pas sur l'affiche.
