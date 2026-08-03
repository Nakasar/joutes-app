# Ajouter une variante d'impression en masse

Un tirage promo ne sort pas sur une carte mais sur un ensemble : le formulaire
carte par carte rendrait l'opération interminable. L'administration des cartes
(`/admin/cards`) propose donc de coller une liste d'identifiants et de définir
une variante à leur appliquer à toutes.

## Saisie

Les identifiants se séparent par un retour à la ligne, une virgule ou un
espace — un copier-coller de liste comme de tableur passe. Les doublons sont
retirés en gardant l'ordre saisi.

**La casse n'est pas normalisée.** Un identifiant mêle un code d'extension en
majuscules et un numéro de collection qui peut porter des lettres
(`SOR-001a`) : tout mettre en majuscules inventerait des identifiants qui
n'existent pas. Les identifiants sans carte correspondante sont donc **rendus
tels quels dans le compte rendu**, jamais avalés en silence — coller deux cents
identifiants dont trente sont fautifs et lire « c'est fait » serait pire que
l'erreur.

## Décision, carte par carte

`planPrintingAddition` (`lib/cards/bulk-printings.ts`) tranche pour chaque
carte, sans toucher à la base :

| Cas | Résultat |
| --- | --- |
| La carte n'a pas cette variante | elle est ajoutée à la suite |
| Elle l'a déjà | carte inchangée, sauf si « remplacer » est coché |
| Elle porte déjà 30 variantes | signalée, non modifiée — au-delà, le formulaire ne pourrait plus l'enregistrer |
| Identifiant inconnu du jeu | signalé |

Une variante est reconnue **par son identifiant dérivé ou par son nom** : un
renommage ne change pas l'identifiant, donc aucune des deux voies ne suffit
seule. C'est ce qui rend l'opération rejouable après une faute de frappe sur
l'image, sans empiler deux fois la même variante.

### Le remplacement conserve l'identifiant existant

Les exemplaires de collection et les wishlists se réfèrent à une variante par
son `printingId`. Régénérer cet identifiant depuis le nom détacherait ces
exemplaires de leur variante : le remplacement réécrit donc le nom, le foil et
l'image, mais garde l'identifiant en place.

## Recherche

Les variantes vivent aussi dans le document Meilisearch — c'est ce que lisent
les écrans qui ajoutent un exemplaire depuis un résultat de recherche. **Les
seules cartes touchées sont réindexées** dans la foulée, plutôt que tout le
catalogue. Un échec d'indexation n'annule pas l'écriture : la base fait foi, et
l'interface le signale.

## Implémentation

- `lib/cards/bulk-printings.ts` — lecture de la liste et décision par carte.
  Couvert par `lib/cards/bulk-printings.test.ts`.
- `lib/db/cards.ts` — `addPrintingToCards` (un seul `bulkWrite` pour les cartes
  qui changent) et `getGameCardsForIndexing`.
- `app/admin/cards/actions.ts` — `addPrintingToGameCards` : validation,
  plafond de 1 000 identifiants par envoi, réindexation ciblée.
- `app/admin/cards/BulkPrintingsForm.tsx` — saisie, confirmation et compte
  rendu dépliable par catégorie.

## Revalidation

Seules les listes sont revalidées — `/admin/cards` et la galerie du jeu. La
fiche d'une carte lit la session (`headers()`) : elle est rendue à chaque
requête et n'a aucune entrée en cache à invalider, donc une `revalidatePath`
par carte n'y changerait rien. À mille cartes, ce serait mille appels sans
effet dans une action déjà bornée pour rester courte.
