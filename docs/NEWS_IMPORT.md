# Import d'une actualité depuis un site extérieur

Le formulaire d'actualité (`/news/create`, `/news/:id/edit`) sait reprendre un
article publié ailleurs — la FAQ d'une sortie sur le site officiel d'un jeu, une
note de mise à jour — en gardant **sa mise en page et ses images**, et en
mettant les noms de cartes entre crochets comme le fait la loupe, pour qu'ils
deviennent des liens à la lecture.

L'exemple qui a servi de mesure :
`https://playriftbound.com/fr-fr/news/rules-and-releases/vendetta-rules-faq-and-clarifications/`
— une FAQ de plusieurs dizaines de milliers de caractères, illustrée carte par
carte.

## Qui y a droit

La permission **`news:update`**, celle qui permet déjà de rédiger une actualité
et d'en téléverser la bannière. Pas de droit dédié, contrairement à l'import
d'un quizz (`quizzes:ai-import`) : **aucun modèle n'est appelé ici**, donc
aucun appel facturé. L'import ne fait rien qu'un rédacteur ne puisse faire à la
main, il le fait seulement plus vite.

## Parcours

1. Bouton **« Importer depuis un lien »**, en tête du formulaire.
2. L'utilisateur colle l'adresse de l'article.
3. `POST /api/news/import` renvoie un brouillon — **l'actualité n'est pas
   enregistrée**. Seules les images le sont, sur le stockage de blobs.
4. Le brouillon **remplace** le titre, le résumé et le contenu du formulaire,
   et renseigne la source. Les jeux et les tags cochés sont conservés : la
   source ne les connaît pas.
5. L'utilisateur relit, corrige, complète, puis publie comme d'habitude.

Le remplacement est annoncé dans la boîte de dialogue quand le formulaire porte
déjà quelque chose. C'est le choix inverse de l'import d'un quizz, qui ajoute
ses blocs à la suite : un quizz s'assemble bloc par bloc, un article arrive
d'un seul tenant et on ne mélange pas deux articles.

## Ce qui est repris, et comment

### La mise en page

La conversion est **déterministe**, sans modèle : le HTML est lu, le corps de
l'article isolé, puis converti en markdown par `node-html-markdown`. Titres,
listes (imbriquées comprises), tableaux, citations, séparateurs, gras et
italique traversent tels quels. Un modèle rendrait un texte *ressemblant* ;
ici, le texte est le même.

Le corps est repéré à la manière de Readability (`pickArticleHtml`) : chaque
paragraphe donne des points à son parent, à son grand-parent (moitié) et à son
arrière-grand-parent (tiers) ; le mieux noté l'emporte, corrigé par la part de
son texte tenue par des liens et par ce que sa classe laisse deviner. Sans
cette remontée, `<body>` gagnerait toujours — il contient tout.

Deux précautions qui viennent de pages réelles :

- **Les blocs voisins sont gardés.** Un article est presque toujours découpé en
  blocs (texte, image, encadré, texte). Ne retenir que le mieux noté le
  couperait à son premier bloc. Les frères qui atteignent un quart du score du
  gagnant sont repris, et **tout bloc portant une image** l'est aussi : un bloc
  d'illustration ne marque aucun point, faute de paragraphe, mais c'est
  justement une des images qu'on est venu chercher.
- **Les crochets ne sont pas échappés.** Le convertisseur écrit `\[` par
  défaut ; or `annotateErrataMarkdown` lit `[E]`, `[Predict 2]` ou
  `[Azir, Empereur]` pour en faire des icônes, des badges de mot-clé et des
  liens de carte. Un crochet échappé les rendrait tous en texte brut —
  exactement ce que l'import cherche à éviter.

Navigation, pied de page, fil d'Ariane, boutons de partage, bandeau de cookies
et bloc « articles liés » sont retirés avant la notation. Le `<h1>` aussi : le
titre est déjà porté par son propre champ, le laisser dans le corps
l'afficherait deux fois.

### Les images

Elles sont **recopiées sur notre stockage** plutôt que pointées chez la source.
Un lien vers le CDN d'un éditeur casse le jour où il réorganise ses dossiers,
et l'actualité perd ses illustrations sans que personne ne s'en aperçoive.

- Au plus 40 images, cinq de front, sous un budget de 60 secondes. Passé ce
  délai, les restantes gardent l'adresse de la source : un brouillon rendu, que
  l'auteur peut déjà relire, vaut mieux qu'un brouillon complet en retard.
- Une image qu'on n'a pas su recopier garde son adresse d'origine ; elle
  s'affichera quand même, le rendu markdown ne passe pas par `next/image`.
- **Sauf la bannière**, qui est abandonnée si sa recopie échoue : la page de
  l'actualité la rend avec `next/image`, lequel n'accepte que les hôtes
  déclarés dans `next.config.ts`. Le brouillon le dit, et l'auteur téléverse la
  sienne.
- Les images paresseuses (`data-src`, `srcset`, `<picture>`) sont suivies — la
  plus large variante d'un `srcset` — et les pixels de suivi (1×1) jetés.

### Les cartes et les mots-clés

Le jeu rattaché à l'actualité décide du catalogue interrogé ; il en faut
**exactement un**, comme pour l'affichage, qui ne résout pas les mentions de
cartes d'une actualité multi-jeux. Sans jeu, aucune détection n'a lieu et
l'interface le dit.

La mise entre crochets est celle de la loupe, mais dans sa variante markdown :
`createMarkdownCardMentionBracketer` (`lib/loop-markdown.ts`) protège les blocs
de code, les liens, les images et les URL nues avant d'appliquer
`createCardMentionBracketer`. Sans cette protection, un nom de carte croisé
dans l'adresse d'une image casserait sa syntaxe —
`![](…/[Flash]-1848x1063.jpg)` — et l'illustration disparaîtrait.

Les **mots-clés de règles** (Accélération, Flux, Deathknell…) n'ont besoin de
rien : `annotateErrataMarkdown` les reconnaît dans le texte nu, sans crochets,
au moment de l'affichage. C'est le même traitement que les policies, les
erratas et les quizz.

## La source

Une actualité porte désormais une attribution optionnelle :

```ts
type NewsSource = { name: string; url: string };
```

Renseignée automatiquement par l'import (nom du site depuis `og:site_name`, à
défaut le nom de domaine ; adresse après redirections), modifiable à la main
dans le formulaire, et retirable — une actualité importée puis entièrement
réécrite ne doit plus revendiquer sa source.

Elle est affichée **avant le corps** de l'actualité, avec un lien vers
l'article d'origine : le lecteur doit savoir qui parle avant de lire, pas
après. La liste des actualités le mentionne aussi (« d'après Riftbound »), et
l'application mobile l'affiche sur le détail d'une actualité.

Le champ est renseigné des deux côtés en base : `source: null` pour une
actualité rédigée sur Joutes. `PATCH /api/news/:id` accepte `null` pour retirer
l'attribution.

## Aller chercher une page extérieure, sans ouvrir de porte

La route récupère une URL saisie par un utilisateur : la requête part du réseau
du serveur, pas de celui de l'appelant. Sans garde-fou, elle deviendrait un
moyen d'atteindre `localhost`, le service de métadonnées de l'hébergeur
(`169.254.169.254`) ou n'importe quelle machine du réseau privé.

- `lib/net/public-url.ts` dit ce qui est public : protocole `http(s)` seulement,
  noms internes (`localhost`, `.local`, `.internal`…) refusés, blocs IPv4 et
  IPv6 privés refusés, y compris les IPv4 déguisées en IPv6
  (`::ffff:127.0.0.1`). Une adresse illisible est refusée — mieux vaut un import
  raté qu'un chemin vers l'intérieur.
- `lib/news/fetch-source.ts` résout le nom d'hôte et vérifie **chaque adresse**
  obtenue, puis suit les redirections à la main : une redirection vers
  `127.0.0.1` annulerait sinon le contrôle initial. Cinq sauts au plus.
- Le corps est lu avec un plafond d'octets (5 Mo pour la page, 5 Mo par image,
  comme le téléversement d'une bannière) et l'ensemble sous délai de 15
  secondes par requête.

## Implémentation

- `lib/news/article-extraction.ts` — métadonnées, choix du corps, conversion en
  markdown. Sans réseau ni base : couvert par
  `lib/news/article-extraction.test.ts`.
- `lib/net/public-url.ts` — ce qui est public, couvert par
  `lib/net/public-url.test.ts`.
- `lib/news/fetch-source.ts` — récupération de la page et des images.
- `lib/news/import.ts` — l'enchaînement : page, extraction, recopie des images,
  détection des cartes.
- `lib/loop-markdown.ts` — `createMarkdownCardMentionBracketer`, couvert par
  `lib/loop-markdown.test.ts`.
- `app/api/news/import/route.ts` — permission `news:update`, `maxDuration` de
  120 secondes pour laisser le temps aux images.
- `app/news/NewsImportDialog.tsx` — la boîte de dialogue, branchée dans
  `NewsForm`.

## Limites connues

- Une page dont le contenu n'existe qu'après exécution du JavaScript ne rend
  rien d'exploitable : on lit le HTML servi, on n'ouvre pas de navigateur. La
  route répond alors `422`.
- Les vidéos et les intégrations (`<iframe>`) ne sont pas reprises.
- Le résumé vient d'`og:description` ; à défaut, des premières lignes de
  l'article, tronquées à 500 caractères. C'est un point de départ, pas une
  rédaction.
- Reprendre un article ne donne aucun droit sur lui. La source est citée et
  liée ; à l'auteur de vérifier qu'il a le droit de republier ce qu'il importe.
