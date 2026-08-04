# Favicon

## Le défaut

Le site ne déclarait **aucune icône**. Les fichiers existaient bien
(`public/logo/favicon.ico` et ses variantes), mais rien ne pointait dessus :

- la page d'accueil ne contenait pas une seule balise `<link rel="icon">` ;
- `https://joutes.app/favicon.ico` renvoyait **404** — l'icône n'était servie
  qu'à `/logo/favicon.ico`, une adresse que personne n'annonce.

Google cherche exactement ces deux choses : une balise `<link rel="icon">` dans
le `<head>` de l'accueil, et à défaut `/favicon.ico` à la racine. Les deux
manquaient, donc il n'avait rien à trouver.

## La correction

Les icônes sont posées à la racine d'`app/`, où Next les reconnaît par
convention de nom et émet les balises tout seul :

| Fichier | Sert | Balise émise |
| --- | --- | --- |
| `app/favicon.ico` | `/favicon.ico` | `<link rel="icon" sizes="48x48">` |
| `app/icon.png` | `/icon.png` | `<link rel="icon" sizes="192x192">` |
| `app/apple-icon.png` | `/apple-icon.png` | `<link rel="apple-touch-icon" sizes="180x180">` |

Le `192×192` n'est pas un hasard : Google recommande un carré **multiple de
48 px**, et juge une icône trop petite indigne d'être affichée. Le `.ico`
contient 16, 32 et 48 — il couvre l'onglet du navigateur et le repli à la
racine, le PNG couvre les résultats de recherche.

L'adresse porte une empreinte du contenu (`/icon.png?icon.1y435xk_t8eqo.png`).
Elle ne change qu'avec l'image, donc reste stable d'un déploiement à l'autre —
ce que Google demande.

## Ce qui ne se corrige pas dans le code

Google ne réaffiche pas l'icône au déploiement : il la reprend **au prochain
passage sur la page d'accueil**, ce qui peut demander plusieurs jours. Une
demande d'indexation de l'accueil dans la Search Console accélère le passage
sans le garantir.

## Notes

`public/logo/site.webmanifest` pointait vers `/android-chrome-*.png` à la
racine, qui n'existent pas non plus — ses chemins sont corrigés. Le manifeste
n'est référencé nulle part : il ne sert à rien tant qu'une balise
`<link rel="manifest">` ne l'annonce pas, ce qui relève d'une décision produit
(installation PWA) et non de ce correctif.
