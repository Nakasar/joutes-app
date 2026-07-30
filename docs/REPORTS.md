# Signalement de contenus

Les utilisateurs connectés peuvent signaler tout contenu créé ou modifié par
d'autres utilisateurs. Les administrateurs traitent ces signalements depuis
`/admin/reports` (l'adresse `/reports` y redirige).

## Côté utilisateur

Le composant `components/ReportButton.tsx` affiche un bouton drapeau qui ouvre
une modale avec un motif facultatif. Il ne s'affiche qu'aux utilisateurs
connectés (`useSession`) et appelle la server action `reportContent`
(`app/reports/actions.ts`).

```tsx
<ReportButton contentType="news" contentId={news.id} />
```

Props :

| Prop          | Description                                                   |
| ------------- | ------------------------------------------------------------- |
| `contentType` | Type de contenu (`ReportableContentType`)                     |
| `contentId`   | Identifiant du contenu tel qu'utilisé dans son URL            |
| `withLabel`   | Affiche le libellé « Signaler » à côté du drapeau             |
| `variant`     | `ghost` (défaut) ou `outline`                                 |
| `size`        | `icon-sm` (défaut) ou `sm`                                    |

Un même utilisateur ne peut signaler qu'une fois un contenu donné : un second
signalement n'ajoute rien tant que le premier est en attente.

Contenus couverts : erratas, politiques de jeu, actualités, quizz, profils
utilisateurs, tournois, ligues, évènements, lieux, listes de souhaits, listes
de vente, groupes de jeu et decks.

## Modèle de données

Collection `reports`, un document par (contenu, utilisateur signalant) :

```ts
{
  contentType: ReportableContentType,
  contentId: string,
  reportedBy: ObjectId,
  reason?: string,
  status: "pending" | "ignored",
  createdAt: Date,
  updatedAt: Date,
  ignoredAt?: Date,
  ignoredBy?: ObjectId,
}
```

Index unique sur `(contentType, contentId, reportedBy)` et index
`(status, createdAt)` pour le regroupement, créés automatiquement au premier
usage de `lib/db/reports.ts`.

## Page d'administration

`/admin/reports` liste les contenus ayant au moins un signalement en attente,
regroupés par contenu, avec le nombre de signalements, les motifs et leurs
auteurs, ainsi qu'un aperçu du contenu (titre, extrait, lien).

Deux actions sont disponibles :

- **Ignorer** : les signalements passent en `ignored`. Le contenu disparaît de
  la liste et n'y revient que s'il est signalé à nouveau (nouveau signalement,
  ou re-signalement par un utilisateur dont le signalement avait été ignoré).
- **Supprimer** : le contenu est supprimé et ses signalements effacés. Pour un
  profil utilisateur, le compte est conservé et la biographie est remplacée par
  « Contenu modéré ». Si la suppression échoue alors que le contenu existe
  toujours, les signalements restent en attente ; ils ne sont clos que lorsque
  le contenu a effectivement disparu.

## Ajouter un nouveau type de contenu signalable

1. Ajouter le type dans `REPORTABLE_CONTENT_TYPES` et son libellé dans
   `REPORTABLE_CONTENT_LABELS` (`lib/types/Report.ts`).
2. Ajouter l'entrée correspondante dans `HANDLERS`
   (`lib/db/reportable-content.ts`) : `preview` (titre, extrait, URL publique)
   et `moderate` (suppression du contenu).
3. Placer `<ReportButton contentType="..." contentId={...} />` sur la page du
   contenu.
