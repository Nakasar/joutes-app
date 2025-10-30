# Configuration Vercel Blob Storage

Ce projet utilise **Vercel Blob Storage** pour gérer l'upload et le stockage des images (icônes et bannières des jeux et des lieux).

## Configuration

### En production (Vercel)

Si votre application est déployée sur Vercel, le stockage Blob est automatiquement configuré :

1. Allez dans votre projet sur [Vercel Dashboard](https://vercel.com/dashboard)
2. Allez dans **Storage** > **Blob**
3. Créez un nouveau Blob Store si ce n'est pas déjà fait
4. Le token `BLOB_READ_WRITE_TOKEN` sera automatiquement configuré

### En développement local

Pour tester l'upload en local, vous avez deux options :

#### Option 1 : Utiliser le Blob Store de production (recommandé)

1. Allez dans votre projet Vercel > **Settings** > **Environment Variables**
2. Copiez la valeur de `BLOB_READ_WRITE_TOKEN`
3. Créez un fichier `.env.local` à la racine du projet :
   ```bash
   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxxx
   ```

#### Option 2 : Utiliser un Blob Store de test

1. Créez un nouveau Blob Store dédié au développement
2. Récupérez le token et ajoutez-le dans `.env.local`

## Utilisation

### Upload d'images dans les formulaires

Les formulaires de création/modification de jeux et de lieux permettent maintenant d'uploader directement des images :

- **GameForm** : Upload d'icône et de bannière pour les jeux
- **LairForm** : Upload de bannière pour les lieux

Les fichiers sont automatiquement :
- Validés (types acceptés : JPG, PNG, WebP, GIF)
- Limités en taille (max 5 MB)
- Uploadés sur Vercel Blob avec accès public
- L'URL est ensuite sauvegardée dans la base de données

### Route API

L'endpoint `/api/upload` gère l'upload des fichiers :
- Méthode : `POST`
- Body : `FormData` avec un champ `file`
- Authentification : Admin uniquement
- Réponse : `{ url, pathname, contentType }`

## Sécurité

- Seuls les administrateurs peuvent uploader des fichiers
- Types de fichiers limités aux images
- Taille maximale de 5 MB par fichier
- Les fichiers sont stockés avec accès public (lecture seule)

## Limites

Vercel Blob propose des limites gratuites généreuses :
- 100 GB de stockage
- 100 GB de bande passante par mois

Pour plus d'informations, consultez la [documentation Vercel Blob](https://vercel.com/docs/storage/vercel-blob).
