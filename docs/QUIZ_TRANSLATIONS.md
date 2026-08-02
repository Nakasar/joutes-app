# Traduction des quizz

Un quizz est écrit dans une langue — sa **VO** — et peut être traduit dans les
autres langues de l'application (`fr`, `en`, `it`, `de`). Il s'affiche dans la
langue du lecteur s'il y est traduit, sinon en version originale.

## Modèle

Le contenu d'un quizz est structuré — des blocs, des questions, des propositions
— et non un texte d'un seul tenant comme une politique ou un errata. Une
traduction ne recopie donc pas la structure : elle range ses textes **sous
l'identifiant du nœud** qu'ils traduisent.

```ts
type QuizTranslation = {
  lang: Locale;
  title: string;
  entries: Record<string, {
    content?;            // bloc de texte
    prompt?; correctText?; correctFeedback?; incorrectFeedback?;  // question
    text?;               // proposition
  }>;
  updatedAt: Date;
};
```

Indexer par identifiant plutôt que par position a deux conséquences voulues :

- **réordonner ou insérer un bloc ne déplace aucune traduction** ;
- **retirer un bloc laisse une entrée orpheline**, simplement ignorée à
  l'affichage — elle redeviendra utile si le bloc revient.

Les identifiants sont des `nanoid` (`[A-Za-z0-9_-]`), donc des noms de champ
Mongo sains : ni point, ni `$`.

## Affichage

`localizeQuiz(quiz, lang)` rend le quizz dans une langue. Le repli se fait
**champ par champ** : une traduction commencée montre ce qui est traduit et
laisse le reste en VO, plutôt que de tout renvoyer en version originale. Un
texte traduit mais blanc compte comme non traduit.

Le lecteur (`QuizPlayer`) choisit la langue de l'interface si le quizz y est
traduit, sinon la VO, et propose un sélecteur (`LanguagePicker`, partagé avec
les politiques) où la version originale porte la pastille **VO**. Les
identifiants ne changeant pas d'une langue à l'autre, **les réponses déjà
données et leur correction survivent au changement de langue**.

Les mentions de cartes sont résolues côté serveur sur la VO **et** sur toutes
les traductions : changer de langue ne demande donc aucun aller-retour serveur.

### Traductions obsolètes

Enregistrer une traduction ne touche pas au `updatedAt` du quizz, qui marque la
dernière modification du *contenu*. Une traduction antérieure à cette date est
signalée au lecteur par `StaleTranslationWarning` : le quizz a changé depuis, et
certains textes peuvent être dépassés ou revenus en VO.

## Traduire

`/quizz/:id/translate/:lang` — deux colonnes : la version originale à gauche, la
saisie à droite, groupées par bloc puis par question. Un champ laissé vide
affiche la VO, ce que le libellé de saisie rappelle. Le compteur en tête annonce
l'avancement (`translationProgress`).

Sont traduisibles : le titre, le texte des blocs, les énoncés, les propositions,
les explications, et **la réponse attendue d'une question libre** — jouer le
quizz en italien suppose de pouvoir y répondre en italien.

L'accès se fait par le menu **Traduire** de la page du quizz, qui liste les
langues autres que la VO et signale celles déjà commencées. La permission est
`quizzes:update`, la même qu'écrire un quizz.

## Implémentation

- `lib/quizzes/translate.ts` — recensement des champs, localisation, obsolescence,
  avancement. Couvert par `lib/quizzes/translate.test.ts`.
- `lib/types/Quiz.ts`, `lib/schemas/quiz.schema.ts` — `originalLang`, `translations`.
- `lib/db/quizzes.ts` — `upsertQuizTranslation` remplace la langue en **une seule
  écriture** (pipeline `$filter` + `$concatArrays`) : un `$pull` suivi d'un
  `$push` perdrait la traduction si la seconde écriture échouait.
- `app/api/quizzes/[quizId]/translations/[lang]/route.ts` — `PUT` et `DELETE`.
- `app/quizz/[quizId]/translate/[lang]/` — l'éditeur deux colonnes.
- `app/quizz/[quizId]/QuizPlayer.tsx`, `QuizTranslateMenu.tsx` — affichage et accès.

Les quizz créés avant cette fonctionnalité n'ont pas de `originalLang` : ils sont
relus en `fr`, la langue par défaut de l'application.
