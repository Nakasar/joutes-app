# Import d'un quizz depuis un texte

Le formulaire de quizz (`/quizz/create`, `/quizz/:id/edit`) sait construire un
brouillon à partir d'un texte libre : fil de discussion sur les règles, question
du jour, FAQ. Le texte est analysé par un modèle, qui en tire les questions et
leurs réponses ; les noms de cartes sont ensuite mis entre crochets, comme le
fait la loupe.

## Parcours

1. Bouton **« Importer depuis un texte »**, à côté des boutons d'ajout de bloc.
2. L'utilisateur colle son texte (20 000 caractères au plus).
3. `POST /api/quizzes/import` renvoie un brouillon — **rien n'est enregistré**.
4. Les blocs obtenus sont **ajoutés à la suite** de ceux déjà saisis. Le titre
   proposé n'est repris que si le formulaire n'en portait pas : un import ne doit
   pas écraser un travail en cours.
5. L'utilisateur relit, corrige, puis publie comme d'habitude.

Le brouillon n'est jamais publié directement : un modèle se trompe, et une
question fausse dans un quizz de règles se remarque tard.

## Détection des cartes

Le jeu rattaché au quizz décide du catalogue interrogé ; sans jeu, aucune
détection n'a lieu et l'interface le dit. La mise entre crochets est celle de la
loupe (`createCardMentionBracketer`, `lib/loop-markdown.ts`) : les noms sont
essayés du plus long au plus court, et un texte déjà entre crochets n'est pas
retouché.

Elle est appliquée à tous les textes rendus en markdown par le lecteur de quizz
— contenu des blocs de texte, énoncés, propositions, explications — car
`AnnotatedMarkdown` les transforme en liens de carte à l'affichage.

**Sauf la réponse attendue d'une question libre** (`correctText`) : elle est
comparée telle quelle à la saisie du joueur, et des crochets la rendraient
impossible à trouver.

Une seule expression est compilée pour tout l'import : le catalogue d'un jeu
pèse des dizaines de milliers de noms, et un import annote des dizaines de
champs.

## Ce que le modèle rend, et ce qui est rétabli

Le modèle ne produit ni identifiants ni références croisées — il désigne les
bonnes réponses par leur **rang** dans la liste des propositions. Tout le reste
est rétabli par `toQuizBlocks` (`lib/quizzes/import.ts`), pour que le brouillon
satisfasse toujours `lib/schemas/quiz.schema.ts` :

- identifiants de blocs, de questions et de propositions ;
- rangs convertis en identifiants de propositions, les rangs hors liste écartés ;
- une seule bonne réponse conservée sur un choix unique ;
- textes bornés aux limites du schéma (énoncé 1 000, proposition 300,
  explication 2 000, 20 propositions).

Une question qu'on ne peut pas rendre valide est **écartée** plutôt que réparée
au jugé : question à choix sans alternative, sans bonne réponse désignée, ou
réponse attendue absente. Mieux vaut un brouillon plus court qu'une question
fausse glissée au milieu des bonnes. Un bloc dont aucune question ne survit
disparaît ; si rien ne survit du tout, la route répond `422`.

## Implémentation

- `lib/quizzes/import.ts` — normalisation, couverte par `lib/quizzes/import.test.ts`.
- `lib/loop-markdown.ts` — `createCardMentionBracketer`, expression compilée une fois.
- `app/api/quizzes/import/route.ts` — permission `quizzes:update`, appel du
  modèle, détection des cartes.
- `app/quizz/QuizImportDialog.tsx` — la boîte de dialogue, branchée dans
  `QuizForm`.

Le modèle utilisé est `gpt-5.4-mini` via `@ai-sdk/openai`, comme la
reconnaissance de cartes du scanner.
