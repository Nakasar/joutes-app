# Traduction des actualités

Une actualité est écrite dans une langue — sa **VO** — et peut être traduite
dans les autres langues de l'application (`fr`, `en`, `it`, `de`).

Contrairement aux politiques et aux quizz, dont le sélecteur de langue vit dans
le navigateur, **la langue d'une actualité tient dans son adresse**. C'est ce
qui la rend partageable, indexable et citable.

## Les deux adresses

| Adresse | Ce qu'elle sert |
| --- | --- |
| `/news/:newsId` | La langue de l'interface du lecteur ; à défaut, la VO. |
| `/news/:newsId/:lang` | Cette langue-là, et rien d'autre. |

La VO garde l'adresse nue : c'est celle qui existait avant les traductions, et
les liens déjà partagés doivent continuer de mener quelque part.

Une adresse qui promet une langue que l'actualité n'a pas répond **404**, tout
comme une langue que l'application ne parle pas. Une page servie porte donc
toujours la langue qu'elle annonce — sans quoi `/news/:id/de` pourrait rendre du
français, et personne ne pourrait s'y fier.

Les segments fixes voisins (`edit`, `translate`) l'emportent sur `[lang]` dans
le routage de Next ; `parseLocale` sert de second filet.

### Ce que les moteurs en voient

`generateMetadata` pose sur chaque page un `canonical` et un
`alternates.languages` listant les autres versions. Sans lui, un moteur qui
trouve la page anglaise et la française y verrait deux pages concurrentes sur le
même sujet plutôt que deux traductions l'une de l'autre. Le titre, la
description et `og:locale` suivent la langue servie.

## Modèle

Le contenu d'une actualité est un texte d'un seul tenant : une traduction le
recopie, comme pour une politique, plutôt que de s'indexer par nœud comme celle
d'un quizz.

```ts
type NewsTranslation = {
  lang: Locale;
  title: string;
  summary: string;
  content: string;
  updatedAt: Date;
};
```

Trois textes seulement. Le titre et le résumé apparaissent dans la liste et dans
les aperçus de partage, où laisser la VO trahirait la traduction dès le premier
coup d'œil. Bannière, jeux, tags et source n'en sont pas : ils ne changent pas
d'une langue à l'autre.

L'actualité porte en plus :

- **`originalLang`** — la langue de rédaction, choisie dans le formulaire et
  proposée par l'import d'après ce que la page déclare (`<html lang>`,
  `og:locale`) ;
- **`contentUpdatedAt`** — la dernière modification des *textes* de la VO,
  distincte d'`updatedAt` que bouge n'importe quelle retouche.

Les actualités écrites avant cette fonctionnalité n'ont ni l'un ni l'autre :
elles sont relues en `fr`, et leur dernière retouche fait office de dernière
modification du texte.

## Affichage

`localizeNews(news, lang)` rend l'actualité dans une langue. Le repli se fait
**champ par champ** : une traduction commencée montre ce qui est traduit et
laisse le reste en VO, plutôt que de tout renvoyer en VO — un résumé pas encore
écrit ne doit pas emporter le corps avec lui. Un texte traduit mais blanc compte
comme non traduit.

Chaque texte porte **sa** langue, et non celle de la page : le repli étant champ
par champ, un titre traduit peut voisiner un résumé resté en VO, et poser une
étiquette unique sur les trois mentirait à la synthèse vocale — qui lirait du
français avec une prononciation anglaise — et à la coupure de mots. D'où
`LocalizedText`, un texte et sa langue, plutôt qu'une chaîne nue.

`availableNewsLangs` ne retient que les langues qui portent vraiment un texte :
une traduction entièrement vide n'aurait qu'une page de VO à offrir, sous une
adresse qui promettrait autre chose. C'est pourquoi **enregistrer une traduction
dont les trois champs sont vides la retire** au lieu de la ranger : elle
n'apparaîtrait nulle part, et l'éditeur renverrait sur une adresse en 404 juste
après un enregistrement réussi.

La résolution se fait **sur le serveur**, avant le rendu. Les mentions de cartes
ne sont donc résolues que pour la langue servie, et non pour toutes les
traductions comme le fait la page d'une politique.

Les listes — `/news`, la section actualités d'un jeu — affichent elles aussi le
titre et le résumé dans la langue du lecteur, et **pointent directement vers
cette version** plutôt que vers une VO qu'il faudrait ensuite quitter.

### Traductions obsolètes

Enregistrer une traduction ne touche pas à `contentUpdatedAt`, sans quoi
enregistrer une langue périmerait toutes les autres. Une traduction antérieure à
cette date est signalée au lecteur par `StaleTranslationWarning`.

Symétriquement, `updateNews` ne déplace `contentUpdatedAt` que si un texte
change **vraiment** : le formulaire renvoie toujours tous les champs, et sans
cette comparaison, ajouter un tag ferait passer toutes les traductions pour
périmées. La comparaison se fait sur le document relu, et non dans une étape
d'agrégation — là-bas, une valeur commençant par `$` serait prise pour un chemin
de champ, et un contenu markdown peut très bien commencer ainsi.

## Traduire

`/news/:newsId/translate/:lang` — la VO à gauche, la saisie à droite, sur les
trois champs. Un champ laissé vide affiche la VO, ce que le libellé de saisie
rappelle. Le compteur en tête annonce l'avancement.

Le corps de la VO est montré en **markdown brut**, pas rendu : c'est ce texte-là
qu'on traduit, crochets de cartes et syntaxe compris, et c'est en le voyant tel
quel qu'on les reporte.

L'accès se fait par le menu **Traduire** de la page de l'actualité, qui liste
les langues autres que la VO et signale celles déjà commencées. Traduire, c'est
modifier ce que le visiteur lit : le droit demandé est celui de rédiger,
**`news:update`**.

### Importer une traduction

Un site officiel publie souvent le même article dans chaque langue, chacun sous
son adresse. L'éditeur de traduction réemploie donc la boîte de dialogue
d'import (voir [NEWS_IMPORT.md](NEWS_IMPORT.md)) : coller l'adresse de la
version anglaise d'un article donne sa traduction telle quelle, mise en page et
images comprises.

Seuls les trois textes en sont repris. La bannière et la source appartiennent à
l'actualité, pas à l'une de ses langues.

## Implémentation

- `lib/news/localize.ts` — langues disponibles, résolution, repli, obsolescence,
  adresses. Sans accès à la base : couvert par `lib/news/localize.test.ts`.
- `lib/types/News.ts`, `lib/schemas/news.schema.ts` — `originalLang`,
  `contentUpdatedAt`, `translations`.
- `lib/db/news.ts` — `upsertNewsTranslation` remplace la langue en **une seule
  écriture** (pipeline `$filter` + `$concatArrays`) : un `$pull` suivi d'un
  `$push` perdrait la traduction si la seconde écriture échouait. Les textes y
  passent par `$literal`, pour la même raison que ci-dessus.
- `app/api/news/[newsId]/translations/[lang]/route.ts` — `PUT` et `DELETE`.
- `app/news/[newsId]/NewsArticleView.tsx` — la page, partagée par les deux
  adresses.
- `app/news/[newsId]/[lang]/page.tsx` — la langue explicite.
- `app/news/[newsId]/translate/[lang]/` — l'éditeur deux colonnes.
- `app/news/[newsId]/NewsLanguageLinks.tsx`, `NewsTranslateMenu.tsx` — lecture
  et accès.

## Et sur mobile

L'application affiche l'actualité dans la langue de l'app si elle y est
traduite, sinon en VO, avec le même repli champ par champ (`src/lib/news.ts`).
Elle n'a qu'un écran par actualité, donc qu'un choix — celui du lecteur : les
adresses par langue sont propres au site. Les traductions ne s'y saisissent pas.
