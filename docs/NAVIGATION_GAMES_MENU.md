# Menu « Jeux » de la barre de navigation

## Le problème

Le menu déroulant « Jeux » proposait les jeux **suivis** par l'utilisateur, et à
défaut trois jeux de la plateforme. Suivre un jeu et le pratiquer ne sont
pourtant pas la même chose : on suit un jeu pour son actualité, ses événements,
la sortie d'une extension, sans forcément vouloir ses outils sous la main tous
les jours. Un joueur qui suit huit jeux se retrouvait donc avec un menu de huit
entrées — plus long à parcourir que la page « Tous les jeux ».

## Ce que le menu propose

Trois sources, de la plus personnelle à la plus générique. La règle vit dans
`lib/games/nav-menu.ts`, module pur testé par `lib/games/nav-menu.test.ts`.

| Situation | Ce que le menu montre | Accès au réglage |
| --- | --- | --- |
| Des favoris | Les favoris | Un engrenage dans le coin |
| Pas de favori, des jeux suivis | Les jeux suivis | Une entrée « Personnaliser » |
| Ni l'un ni l'autre (visiteur compris) | Les jeux par défaut de la plateforme | Une entrée « Personnaliser » |

Un **favori** est un jeu mis en avant **parmi les jeux suivis** — le seul choix
explicite de l'utilisateur, il passe donc devant. Il se pose de deux endroits :
l'étoile de la fiche du jeu, à côté du bouton « Suivre » (elle n'y apparaît que
pour un jeu suivi), et la section « Mes jeux suivis » de `/account`.

L'accès au réglage change de forme selon le cas, et ce n'est pas cosmétique :
qui n'a pas encore de favori a besoin qu'on lui montre où les poser, d'où une
entrée en toutes lettres ; qui en a déjà connaît le chemin, et l'engrenage du
coin lui laisse la place pour ses jeux. Les deux mènent à `/account#jeux`.

Le plafond de cinq entrées s'applique **après** le choix de la source, jamais à
la lecture des jeux suivis : un favori posé sur le huitième jeu suivi
disparaîtrait sinon du menu qu'il est censé commander.

## Les outils en sous-menu

En liste, chaque jeu ouvre ses outils en sous-menu (`Jeux → Magic → Cartes`).
La galerie de cartes d'un jeu était jusqu'ici à deux pages de la barre de
navigation, et se trouvait par hasard — en passant par sa collection, puis en
cliquant sur le jeu. L'entrée du jeu reste cliquable et mène à sa fiche : le
sous-menu ajoute des chemins, il n'en retire aucun. Un jeu qui n'active aucun
outil n'a pas de sous-menu, celui-ci ne contiendrait que sa fiche.

Le menu mobile déplié n'en a pas : il est déjà long, et cinq jeux multipliés par
leurs outils en feraient une page à part entière. Sur téléphone, les outils se
trouvent sur la fiche du jeu.

## Un seul jeu : ses outils

Quand la sélection se réduit à **un seul jeu** — un favori unique, ou un unique
jeu suivi sans favori —, la liste n'a plus d'intérêt : elle ne proposerait qu'un
clic de plus vers ce jeu. Le menu montre alors directement ses outils (cartes,
règles, produits, collection, cubes, vérificateur de deck, tournois, rapport de
bataille), sous les mêmes conditions que sa fiche : un outil désactivé pour le
jeu n'apparaît pas, un menu qui y mènerait promettrait ce que le jeu n'a pas.

Les jeux **par défaut** en sont exclus, même seuls : ils ne sont le choix de
personne, et réduire la navigation d'un visiteur aux outils d'un jeu qu'il n'a
pas demandé l'enfermerait dans un jeu au hasard.

## Structure technique

- `lib/games/nav-menu.ts` — `selectMenuGames`, `showsGameTools`, `gameToolLinks`.
  Sans accès à la base ni à React, donc testable.
- `lib/types/User.ts` — `favoriteGames`, toujours un sous-ensemble de `games`.
- `lib/users/document.ts` — la conversion d'un document `user`. Elle est
  explicite champ par champ : un champ ajouté au type sans l'être ici est écrit
  en base et perdu à chaque lecture. C'est arrivé aux favoris ; un test le
  vérifie désormais sur le type entier.
- `lib/db/users.ts` — `addFavoriteGameToUser` (refusé si le jeu n'est pas suivi),
  `removeFavoriteGameFromUser`, et `removeGameFromUser` qui retire le favori avec
  le suivi : un favori orphelin resterait invisible et intouchable.
- `app/api/users/me/games` — rend `gameIds`, `games` (nom, slug, visuel et
  fanions des outils) et `favoriteGameIds`.
- `app/account/actions.ts` — `setFavoriteGameAction`.
- `app/account/GamesManager.tsx` et
  `app/games/[gameSlugOrId]/FavoriteGameButton.tsx` — l'étoile, en affichage
  optimiste : le serveur peut refuser, l'étoile revient alors en arrière. La
  fiche du jeu ne la rend que pour un jeu suivi, une action vouée à échouer
  n'ayant pas à être proposée.
- `components/Header.tsx` — les trois rendus du menu (large, intermédiaire,
  mobile) parcourent la même liste d'entrées. L'engrenage est un
  `DropdownMenuItem` malgré son allure d'en-tête : dans un menu Radix, seuls les
  items entrent dans la navigation au clavier.
- `lib/games/games-changed.ts` — le signal `joutes:games-changed`. L'en-tête est
  un composant client : `router.refresh()` rejoue les composants serveur mais lui
  laisse son état, et le menu resterait en retard d'un suivi ou d'un favori
  jusqu'au prochain chargement complet. Tout ce qui modifie ces listes l'émet ;
  l'en-tête relit à ce moment-là.
