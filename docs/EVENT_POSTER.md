# L'affiche des événements

## Vue d'ensemble

Une **affiche A4 portrait** d'événements, prête à publier sur ses réseaux ou à
imprimer : la semaine ou le mois, dans l'un de sept styles. Deux chemins y
mènent, et rendent le même document :

- **l'affiche d'un lieu**, `/lairs/[lairId]/affiche`, que son écran de gestion
  montre en aperçu et ouvre pour l'impression. Un lieu Joutes Pro y signe le
  pied de page ;
- **l'affiche composée**, `/affiche?lairs=…`, qu'un joueur assemble depuis
  `/affiches` en choisissant des lieux et des jeux. Le pied de page y reste
  celui de Joutes.

Les maquettes qui ont fixé les styles sont sous `design/affiche-evenements/`.

## Ce que l'affiche connaît de son sujet

`components/posters/Poster.tsx` ne reçoit pas un lieu mais un **sujet**
(`PosterSubject`) : le bloc d'identité de l'en-tête, l'adresse que le QR code
encode, et le fait que plusieurs lieux s'y mêlent ou non. C'est ce qui permet
aux deux chemins de partager le rendu entier sans que les styles sachent lequel
les emploie — et ce qui interdit à l'affiche de lire un lieu pour son compte.

Quand le sujet réunit plusieurs lieux, chaque événement écrit le sien
(`PosterEvent.venue`, classe `.evenue`) : une affiche qui annonce des soirées
sans dire où elles ont lieu ne sert à rien. Sur l'affiche d'un lieu, le champ
reste vide — son nom est déjà en tête — et la ligne garde exactement la forme
qu'elle avait.

Ce nom **ne se coupe jamais** : c'est l'information qu'on vient chercher. Il se
replie sur deux lignes, et la rangée d'un mois se replie avec lui. La première
version le rognait à l'ellipse pour tenir dans une colonne de 150 px, et rendait
« Caverne du Gobeli… ». Le style cyberpunk, seul à le poser en quatrième colonne
d'une rangée qui n'en fait que 532, l'a rejoint sur la ligne des métadonnées où
les six autres l'écrivent déjà — sans quoi il ne restait que 116 px au nom de
l'événement.

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
| `brandLogo`, `brandTitle`, `brandText` | texte | Par-dessus la signature du pied de page. |
| `ctaTitle`, `ctaText`, `ctaUrl` | texte | Par-dessus l'appel à l'action et l'adresse du QR code. |
| `print` | `1` | Ouvre la boîte d'impression une fois les polices chargées. |

Les paramètres de réglage existent pour l'aperçu de l'écran de gestion : il
montre un réglage avant qu'il soit enregistré. Le contrôle Pro s'applique aux
deux chemins (`resolvePosterStyle`, `readPosterOptions`).

Les six derniers écrivent un texte libre et une adresse à scanner : ils ne sont
relus **que pour l'équipe du lieu** (`canManageLair`). Une affiche partagée ne
dit donc que ce qui est enregistré — sans cette porte, n'importe quelle adresse
`joutes.app/lairs/…/affiche` deviendrait une affiche à dire ce qu'on veut et à
faire scanner où l'on veut. Un champ **présent mais vide** y vaut « effacé », un
champ absent « pas demandé » : c'est ce qui permet à l'aperçu de montrer un
champ qu'on vient de vider.

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

Le verrou des quatre styles réservés se lève de deux façons, et
`resolvePosterStyle` ne sait pas laquelle : le lieu tient **Joutes Pro** pour
l'affiche qu'il publie, le compte tient **Joutes Expert ou Joutes Pro**
(`sub:poster-styles`) pour celle qu'un joueur compose. Un style réservé demandé
sans ce verrou retombe sur `joutes` au rendu : un abonnement arrêté ne casse
pas une affiche déjà partagée.

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

## Le pied de l'affiche — Joutes Pro

Tout en bas, deux blocs que l'affiche écrit d'elle-même : la signature Joutes
— l'emblème, le nom, une ligne — et l'appel à l'action, sa phrase et son QR
code vers la page du lieu. Un lieu **Joutes Pro** met les siens à la place,
sous `lair.options.poster` :

- `branding` — `logo`, `title`, `text` : la signature, à la place du bloc
  Joutes ;
- `cta` — `title`, `text`, `url` : l'appel à l'action, et ce que le QR code
  encode.

Chaque champ est indépendant : un lieu qui ne pose que son logo garde le nom et
la ligne de Joutes sous celui-ci, et un champ laissé vide n'efface rien — il
rend la main au style, qui écrit alors son propre texte
(`Lairs.poster.styles.<clé>.cta`, `ctaSub`, `brandLine`). L'écran de gestion le
dit à sa façon : ces textes-là sont l'indication de saisie des champs.

La résolution vit dans `components/posters/Poster.tsx`, avec tout le reste de
ce qui se calcule : les styles reçoivent un `brand` et un `cta` déjà décidés,
et n'en connaissent pas l'origine. Deux détails s'y logent :

- le logo et l'adresse du QR code repassent par `externalUrl` avant d'être
  posés dans un `src` et encodés — un QR code se scanne sans se lire ;
- le style `cyberpunk` n'écrit pas de phrase sous son appel à l'action mais
  l'adresse elle-même : il n'a pas de `ctaSub`, et c'est l'adresse encodée qui
  lui sert de texte par défaut. Sa signature en capitales, elle, est passée à
  `poster.css` (`text-transform`) : la casse est une affaire de rendu, pour que
  le nom d'un lieu la prenne comme celui de Joutes.

Comme le style Pro, la personnalisation retombe sur la signature Joutes dès que
l'abonnement s'arrête — l'affiche déjà partagée reste lisible —, et les
réglages restent en base pour le jour où il reprend. L'action refuse en bloc
(`PRO_REQUIRED`) une personnalisation non vide venue d'un lieu non abonné, mais
laisse ce lieu **effacer** la sienne : sans quoi le verrou emprisonnerait ce
qu'il garde.

## L'écran de gestion d'un lieu

Onglet **Affiche** (`?tab=poster`), `LairPosterSettings.tsx` : la période et
sa navigation, les deux interrupteurs, le sélecteur de style avec le verrou
Pro, la signature et l'appel à l'action — cinq champs et un dépôt d'image,
sous le même verrou —, l'aperçu — une `iframe` de la vraie page, réduite —, et
l'export.

L'export passe par le navigateur : **Imprimer ou enregistrer en PDF** ouvre
l'affiche avec `print=1`. Le format d'impression est fixé à l'A4 sans marge
(`@page`), et l'affiche est dessinée à 794 × 1123 px, soit 210 × 297 mm à
96 dpi : elle sort à l'échelle. Il n'y a pas d'export PNG direct : il
demanderait un moteur de rendu côté serveur ou une dépendance de
rastérisation, et le PDF se convertit sans perte.

## L'affiche composée par un joueur

`/affiches` (`(app)/affiches/PosterBuilder.tsx`) : des lieux, des jeux, une
période, les deux interrupteurs, un style, l'aperçu et l'export. **Rien ne
s'enregistre.** L'affiche *est* son adresse — tous les choix tiennent dans la
requête —, ce qui la rend partageable telle quelle, réimprimable la semaine
suivante en changeant un paramètre, et dispense la base d'un document de plus.
L'écran n'a donc ni bouton « enregistrer », ni état à réconcilier.

| Paramètre | Rôle |
| --- | --- |
| `lairs` | Les lieux, séparés par des virgules. Huit au plus (`MAX_POSTER_LAIRS`). |
| `games` | Les jeux à garder — identifiant ou limace. Absent : tous les jeux. |

Les autres paramètres — `period`, `start`, `style`, `attendance`, `logos`,
`print` — sont ceux de l'affiche d'un lieu.

`lib/posters/selection.ts` lit cette requête, et rien de plus : un identifiant
qui n'a pas la forme d'un `ObjectId` est **écarté**, faute de quoi
`new ObjectId("bonjour")` lèverait et rendrait 500 — « le serveur est en
panne » — là où la bonne réponse est de n'en rien faire.

Le choix des lieux passe par `visibleLairsAmong` (`lib/lairs/visible.ts`), qui
porte la même règle que `requireVisibleLair` : public pour tous, privé pour
ceux qui le suivent, son équipe et l'administration. La différence est ce qu'on
en fait — la vitrine d'un lieu privé rend 404, l'affiche **écarte** le lieu
qu'on n'a pas le droit de voir et rend le reste. Refuser la page entière
apprendrait au passage qu'un lieu privé existe à cette adresse. Plus aucun lieu
visible, et la page rend 404 : une sélection vide et une sélection entièrement
privée se répondent de la même façon.

Le filtre par jeu se fait sur le **nom** que porte l'événement — le seul lien
entre un événement et un jeu en base —, et non par une conversion en `ObjectId`
d'une clé venue de l'URL. Le composeur, lui, ne propose que les jeux des lieux
retenus : un catalogue entier ferait cocher des jeux qu'aucun lieu ne propose,
donc une affiche vide sans qu'on comprenne pourquoi.

### Le pied de page n'y est pas réglable

L'affiche d'un lieu Pro porte sa signature parce que c'est son programme ;
celle-ci réunit les lieux d'autrui et ne signe donc au nom de personne :
l'emblème Joutes, ses textes, et un QR code vers `joutes.app`. Rien n'est
passé pour l'obtenir — la page appelle `readPosterOptions(undefined, …)` sans
dérogation de signature, et les champs absents suffisent.

### Le verrou se lit sur le visiteur

`sub:poster-styles` est vérifié sur **le compte qui regarde**, non sur celui
qui a composé l'affiche : rien n'est enregistré, il n'y a donc pas d'auteur à
retrouver. Une adresse partagée montre par conséquent le style par défaut à qui
n'est pas abonné — le même repli que pour un lieu dont l'abonnement s'arrête,
et jamais une page en erreur.

## Ce qui est décidé, et ce qui reste ouvert

- Le mois liste chaque semaine ; un mois très chargé déborde de la page,
  l'affiche coupant ce qui dépasse. Une seconde page ou des lignes plus
  courtes seront à prévoir si le cas se présente.
- Le format A4 déborde du 4:5 d'Instagram ; un format story pourra venir
  ensuite.
- Les événements annulés ne figurent pas sur l'affiche.
- L'affiche composée ne s'enregistre pas. Si le besoin d'une affiche
  « de la semaine » qu'on retrouve d'un clic apparaît, c'est un favori à poser
  sur l'adresse, pas un document à ajouter en base.
- Huit lieux au plus, et rien ne prévient quand la page déborde : c'est la même
  limite que le mois très chargé ci-dessus, et elle se traitera avec lui.
