# Sources d'événements d'un lieu

Un lieu public peut déclarer des **sources** d'où ses événements sont
moissonnés automatiquement : une page lue par sélecteurs CSS, un JSON décrit
champ par champ, ou — en dernier recours — une page lue par un modèle. Le cron `/api/cron/refresh-events` les relit chaque mercredi
à 8 h ; le bouton **Rafraîchir** de la fiche d'administration
(`/admin/lairs/:id?tab=sources`) fait la même chose à la demande.

| Fichier | Rôle |
| --- | --- |
| `lib/services/refresh-events.ts` | Lit chaque source, appelle le modèle ou applique la correspondance, écrit le rapport |
| `lib/events/source-events.ts` | Tout ce qui se décide sans la base : dates, statuts, jeux, **rapprochement** avec l'existant |
| `lib/events/html-source.ts` | La lecture d'une page par sélecteurs : titre composé, champs, jeu |
| `lib/events/html-presets.ts` | Les configurations toutes faites (boutique Oasis) |
| `lib/db/events.ts` — `upsertEventsForLair` | Exécute le verdict du rapprochement en une écriture groupée |
| `lib/db/lairs.ts` — `*EventsRefreshReport` | Le compte rendu du dernier tour, lu par l'administration |
| `app/api/cron/refresh-events/route.ts` | Le cron : les lieux qui ont une source, trois à la fois |
| `app/[locale]/(app)/admin/lairs/[lairId]/LairEventSourcesForm.tsx` | Le formulaire, avec le test d'une source et le rapport |

## Pourquoi les favoris se perdaient

Un événement en base porte des **favoris** et des **inscriptions**, rattachés
à son `id`. L'ancien rafraîchissement retrouvait bien les événements par leur
URL et les mettait à jour… mais ne notait pas leur identifiant dans la liste
de ce qu'il venait de toucher, et le grand nettoyage qui suivait supprimait
tout ce qui n'y figurait pas — c'est-à-dire **tous les événements mis à
jour**. Au tour suivant, ils étaient recréés avec un nouvel `id`, vierges de
tout favori. Les événements sans URL subissaient le même sort à chaque tour,
étant réinsérés sans jamais être reconnus.

S'ajoutaient trois causes de perte moins visibles :

- **l'année forcée** : toute date était ramenée à l'année en cours, sauf
  décembre vu de janvier. Un tournoi de janvier 2027 lu en septembre 2026
  partait en janvier 2026, dans le passé, et disparaissait ;
- **une page en panne** rendait une page d'erreur, lue comme une page sans
  événement : tout ce que la source annonçait était retiré ;
- **un jeu mal orthographié** (« riftbound ») ne rejoignait aucun jeu de la
  plateforme, et l'événement n'apparaissait sur aucun agenda.

## Le rapprochement

Chaque tour confronte ce que les sources rendent à **tout** ce que le lieu a
d'automatisé, passé compris. Un événement est reconnu par, dans l'ordre :

1. son **identifiant chez la source** (`source.externalId`) — ce que le champ
   `id` d'une correspondance JSON donne ;
2. sa **page d'événement et son jour** — un lien partagé par plusieurs dates
   ne mélange pas les jours ;
3. son **nom et son jour**, à la casse, aux accents et à la ponctuation près ;
4. sa **page d'événement** seule, s'il n'a pas commencé — la date a bougé, on
   suit ; un événement passé, lui, ne glisse jamais sur une date nouvelle ;
5. son **créneau exact et son jeu** — il a été renommé.

Les règles s'appliquent en passes successives sur tout le lot, pour qu'une
règle stricte serve tout ce qu'elle peut avant qu'une règle large ne prenne
un candidat. Un événement reconnu est mis à jour **en place** : `id`,
favoris, inscriptions, tableaux Discord restent. S'il n'a pas changé, rien
n'est écrit.

Un événement **disparu** de sa source, et qui n'a **pas encore commencé** :

- est **retiré** si personne ne le suit ;
- est **annulé** — statut `cancelled` — si quelqu'un l'a en favori ou s'y est
  inscrit. S'il revient au tour suivant, il est reconnu et reprend le statut
  que la source lui donne ; s'il est bien annulé, la personne le voit barré
  plutôt que de le chercher en vain.

Ce qui a déjà commencé n'est jamais retiré ni annulé : une boutique ôte un
événement de son agenda sitôt qu'il a eu lieu, et ce n'est pas une annulation
— les présences de la veille doivent rester. Les événements saisis à la main
(`addedBy: "USER"`) sont ignorés quoi qu'il arrive.

### Une source en panne

Chaque source est lue à part, avec un délai de 25 s, un agent identifiable,
un refus des réponses HTTP en erreur, et un décodage dans le jeu de
caractères que la page annonce — bien des boutiques servent encore de
l'ISO-8859-1, et lire en UTF-8 cassait les accents (« D�fis de ligue »)
jusque dans le rapprochement par nom. Une source qui échoue **laisse ses
événements en l'état** : ils ne sont ni retirés, ni annulés. Les autres
sources sont traitées normalement. Un événement moissonné avant cette version,
qui ne sait pas de quelle source il vient, n'est retiré que si toutes les
sources ont répondu.

Tout cela s'appuie sur `Event.source` — `{ url, externalId? }` —, écrit à
l'insertion et complété à la première mise à jour d'un événement plus ancien.

## Les dates

Une source JSON donne des dates complètes : son année est **crue** tant
qu'elle est plausible (de l'an dernier à deux ans devant). Le modèle, lui, dit
s'il a **lu** l'année sur la page (`yearOnPage`) ou s'il l'a déduite ; dans le
second cas, on choisit entre l'an dernier, cette année et l'an prochain
l'année qui place la date dans la fenêtre d'un agenda — deux mois en arrière,
dix en avant. En décembre, « 15 janvier » désigne bien le mois prochain.

Une fin absente vaut quatre heures après le début ; « 20 h — 1 h » sur la même
date se lit comme finissant le lendemain. Tout est écrit en heure de Paris.
Les formats lus : ISO, SQL, RFC 2822, HTTP, horodatage en secondes ou en
millisecondes, `jj/mm/aaaa [hh:mm]`.

## Configurer une source

### Tester avant d'enregistrer

Chaque source du formulaire a un bouton **Tester la source** : il lit la page
ou le JSON tel qu'il est saisi, sans rien écrire, et affiche les événements
obtenus — nom, dates, jeu, prix, statut, lien, identifiant — avec les
**avertissements** : une date illisible, un statut inconnu, un jeu que la
plateforme ne connaît pas. C'est là qu'une correspondance se met au point.

### Source HTML (sélecteurs)

La lecture d'une page **sans modèle** : ni coût, ni hallucination, et un
résultat identique d'un tour à l'autre. C'est la source à préférer dès que la
page a une structure régulière — ce qui est le cas de toutes les boutiques en
ligne, où les événements sont des produits.

- **Sélecteur des événements** : l'élément qui entoure chaque événement
  (`.product_box`, `li.event`…). S'il ne désigne rien, la source est en
  panne, pas vide : une mise en page qui change ne retire rien.
- **Champs** : pour chacun, un sélecteur relatif à l'événement (vide :
  l'événement lui-même) et, au choix, le texte de la cible ou l'un de ses
  attributs (`href`, `datetime`, `idProduit`…).
- **Titre composé** : quand la page met tout dans un titre — « Riftbound -
  Tournois Nexus - 03/09/2026 - 19h30 » —, on renseigne `title` plutôt que
  `name`, `gameName` et `startDateTime`. La date (`JJ/MM/AAAA`, `JJ/MM/AA`,
  « 15 mars 2026 ») et l'heure (`19h30`, `14h`, `10:30`) sont reconnues à leur
  motif, où qu'elles soient ; le reste est coupé au séparateur (« - » par
  défaut, un tiret ne comptant qu'entouré d'espaces) : premier segment le
  jeu, le reste le nom. Un champ dédié, s'il est renseigné, l'emporte.
- **Statut** : lu dans un texte de stock ou de disponibilité (« En stock »,
  « Rupture », « Complet », « Annulé »…).
- **Préréglages** : le bouton « Boutique Oasis » remplit la configuration de
  cette plateforme de boutique (celle de l'Antre Temps), modifiable ensuite.

Tous les champs lus passent par les mêmes lecteurs que la correspondance JSON
(prix, liens relatifs, dates) ; l'identifiant, s'il y en a un (`idProduit`),
devient l'`externalId` du rapprochement.

### Alias de jeu

Pour tous les types de source : « MTG » → « Magic: The Gathering ». Les clés
se comparent à la casse et aux accents près. Sans alias, un jeu est reconnu
s'il porte le nom de la plateforme à la ponctuation près (« Star Wars
Unlimited » → « Star Wars: Unlimited »), ou si ce nom apparaît **dans** le
titre (« Avant Premiere MTG Réalité Fracturée » avec l'alias `MTG`). Un jeu
inconnu est écrit tel quel et signalé : un alias, ou un nouveau jeu sur la
plateforme, le réglera au tour suivant.

### Source IA

Une URL, et des consignes facultatives — où sont les dates, quels blocs
ignorer. La page est convertie en Markdown et confiée au modèle avec la date
du jour, la liste des jeux de la plateforme et les consignes du lieu. À
réserver aux pages sans structure exploitable : chaque lecture coûte un appel
au modèle, et deux lectures de la même page ne rendent pas toujours la même
chose.

### Source en correspondance

- **Chemin vers les événements** : `data.events`, `results[0].items`… ; `$`
  ou vide si le JSON est directement la liste. Un objet indexé par
  identifiant (`{ "42": {…} }`) est accepté comme une liste.
- **Correspondance des champs** : le chemin de chaque champ dans un événement.
  Renseignez **`id`** dès que le JSON en donne un : c'est le rapprochement le
  plus sûr, celui qui survit à un renommage et à un changement de date.
- **Préfixe de base d'URL** : collé devant `id` quand l'événement n'a pas de
  lien propre.
- **Valeurs par défaut** : remplacent le champ correspondant pour tous les
  événements de la source — un `gameName` fixe pour un JSON qui ne le donne
  pas, par exemple.

Les statuts sont reconnus sous leurs noms courants (`open`, `full`,
`complet`, `canceled`, `annulé`, un booléen…) ; un statut inconnu vaut
`available` et fait un avertissement. Les prix se lisent en nombre ou en
texte (`"12,50 €"`, `"Gratuit"`). Le nom du jeu est rapproché de ceux de la
plateforme, à la casse et aux accents près.

## Le rapport

Chaque tour écrit sur le lieu, dans `eventsRefresh`, ce qu'il a donné : la
date, et par source, succès ou échec, la raison, les avertissements et le
nombre d'événements ; puis les comptes — nouveaux, mis à jour, inchangés,
annulés, retirés. Le formulaire l'affiche en tête de l'onglet, pour qu'une
source en panne depuis trois semaines se voie sans lire les journaux.

Le rapport ne sort **pas** avec le lieu (`toLair`) : ses messages d'erreur
décrivent des pannes de sites tiers et n'ont rien à faire sur `GET
/api/lairs`. Il se lit par `getLairEventsRefreshReport`, depuis
l'administration.

## Vérifier à la main

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/refresh-events
```

La réponse détaille chaque lieu et chaque source ; `summary.failingSources`
compte les sources en panne dans des lieux par ailleurs réussis.

```bash
node --import ./scripts/ts-paths-hook.mjs --test lib/events/source-events.test.ts lib/events/html-source.test.ts
```

Les tests couvrent les dates, les champs, et surtout le rapprochement : le
scénario d'origine — un événement retrouvé par son URL, avec un favori, mis à
jour et **pas** retiré — y est en premier. La lecture HTML est testée sur un
extrait réel de la page de l'Antre Temps (`lib/events/__fixtures__/`).
