# Les illustrations du manuel utilisateur

Le manuel destiné aux boutiques, associations et organisateurs vit dans Notion,
sous **Joutes > Manuel**. Ses illustrations sont rendues d'ici.

Deux familles, et elles n'ont pas la même nature :

- **Les maquettes d'écrans** (`ecrans/`) — des reproductions fidèles de
  l'interface, écrites à la main. Elles reprennent les libellés exacts de
  `messages/fr.json` ; elles ne sont pas des captures de l'application.
- **Les affiches** — les sept styles, rendus depuis les maquettes de conception
  de `design/affiche-evenements/`. Celles-là sont les vraies : ce sont les
  fichiers qui ont fixé les styles.

## Rendre

```bash
npm i -D playwright
node design/manuel/render.mjs            # tout
node design/manuel/render.mjs ecrans     # les seules maquettes d'écrans
node design/manuel/render.mjs affiches   # les seuls styles d'affiche
node design/manuel/render.mjs vitrine organizer
```

Les PNG sortent dans `rendu/`, qui n'est pas versionné : **ce sont les sources
qu'on garde, pas les images**. Elles se déposent ensuite à la main dans la page
Notion correspondante — le nom de chaque fichier porte le chapitre visé, et
`render.mjs` le rappelle à chaque ligne de sortie.

Si Chromium est déjà installé ailleurs, `CHROMIUM_PATH` court-circuite le
téléchargement de Playwright.

## Pourquoi des maquettes et pas des captures

Les écrans qui comptent pour ce manuel — gestion d'un lieu, portail
organisateur, page Joueurs — ne s'ouvrent qu'avec une session connectée et des
données plausibles. Une capture demanderait un jeu de données de démonstration
tenu à jour, et referait surface à chaque évolution du thème. Une maquette se
relit, se corrige au mot près, et se rend en trois secondes.

La contrepartie est qu'**une maquette peut mentir**. D'où la règle : les
libellés viennent de `messages/fr.json`, jamais de mémoire. Quand une chaîne
change là-bas, la maquette qui la porte est à corriger ici.

## Ce que contient `ecrans/`

| Fichier | Écran | Chapitre du manuel |
| --- | --- | --- |
| `vitrine.html` | La page publique d'un lieu | 3 · La page de votre lieu |
| `manage.html` | L'écran de gestion, onglet Personnalisation | 3 · La page de votre lieu |
| `connect.html` | L'assistant « Connecter mon site », étape Vérification | 4 · Vos événements |
| `event.html` | Le formulaire de création d'un événement | 4 · Vos événements |
| `players.html` | La page Joueurs et son pointage | 5 · Les inscriptions |
| `wizard.html` | Le tunnel de création d'un tournoi, étape Format | 6 · Vos tournois |
| `organizer.html` | Le portail organisateur, page Rondes | 6 · Vos tournois |
| `standings.html` | Le classement et sa ligne de coupe | 6 · Vos tournois |
| `projection.html` | L'écran de salle | 6 · Vos tournois |
| `player.html` | Le portail joueur sur téléphone | 6 · Vos tournois |
| `league.html` | Une ligue au format points | 7 · Vos ligues |

`base.css` porte les jetons communs — couleurs, cartes, pastilles, tableaux,
interrupteurs. Un nouvel écran s'écrit en composant ces classes ; il n'a
normalement pas de CSS à lui au-delà de sa largeur.

Chaque fichier expose un unique élément `.screen`, qui est ce que le script
capture. Sa largeur est déclarée dans le HTML **et** dans `render.mjs` : le
viewport doit être au moins aussi large, sans quoi la page se replie avant
d'être photographiée.

## Les affiches

`render.mjs` lit `design/affiche-evenements/*.dc.html`, les maquettes de
conception des sept styles. Ce sont des canvas Claude Design : leur élément
racine porte `class="{{modes}}"`, que l'outil de conception remplit au
chargement, et ils chargent un `support.js` qui n'existe pas dans le dépôt.
Le script pose donc les classes lui-même (`poster <style> jeux-logos`) et retire
le script manquant — sans quoi la feuille de style ne s'applique à rien et la
page sort en texte brut sur fond coloré.

Les polices Google sont retirées au passage : hors ligne, elles n'aboutissent
pas, et la chaîne de repli de chaque style prend le relais. Le rendu diffère donc
légèrement de la production sur le dessin des lettres, pas sur la mise en page.

Le cadrage est celui du document réel : 794 × 1123 px, soit l'A4 à 96 dpi,
capturé à deux fois cette densité.
