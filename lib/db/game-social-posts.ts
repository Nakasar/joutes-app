import "server-only";

import { AnyBulkWriteOperation, Document, ObjectId, WithId } from "mongodb";

import db from "@/lib/mongodb";
import type { SocialPlatform } from "@/lib/social/platforms";
import type {
  CollectedSocialPost,
  GameSocialPost,
  SocialAccount,
  SocialPostKind,
} from "@/lib/types/GameSocialPost";

/**
 * Les publications rapatriées des réseaux des éditeurs.
 *
 * Index attendus sur `game_social_posts` (voir `scripts/db/ensure-indexes.ts`) :
 *
 *  - `{ gameId: 1, platform: 1, externalId: 1 }` **unique** — une publication
 *    n'existe qu'une fois par jeu. C'est la clé de l'upsert, et l'unicité est
 *    une **règle** : sans elle, deux tours qui se chevauchent doubleraient la
 *    grille.
 *  - `{ gameId: 1, hiddenAt: 1, publishedAt: -1 }` — sert à la fois la lecture
 *    des vitrines et le tri de la purge.
 *
 * ## Le masquage survit à la collecte, et voici comment
 *
 * Trois garanties, qui tiennent ensemble et qu'il ne faut pas défaire
 * séparément :
 *
 * 1. **L'upsert n'écrit jamais `hiddenAt`**, ni en `$set` ni en `$setOnInsert`.
 *    La collecte rafraîchit du contenu ; elle ne rend pas de verdict. Toute
 *    ligne ajoutée un jour au `$set` doit être pesée à cette aune.
 * 2. **La purge de rétention ne voit que les non-masquées.** Une publication
 *    masquée ne compte pas dans les cent et ne sort donc jamais de la fenêtre.
 * 3. **Le ménage ne supprime jamais une masquée** — ni celui d'avant réseau, ni
 *    celui d'après.
 *
 * Autrement dit, `hiddenAt` fait du document une **pierre tombale** : son
 * contenu ne sert plus à personne, sa seule fonction est d'occuper la clé unique
 * pour que la collecte suivante ne puisse pas ressusciter la publication. Le
 * coût est borné par le nombre de gestes de modération, c'est-à-dire par rien.
 *
 * Voir `docs/GAME_SOCIAL.md`.
 */

const COLLECTION_NAME = "game_social_posts";

const collection = db.collection(COLLECTION_NAME);

/**
 * Combien de publications un jeu garde.
 *
 * **Contrainte à respecter en changeant les limites de collecte :** la somme de
 * ce qu'un tour peut moissonner pour un jeu doit rester très inférieure à cette
 * valeur. Aujourd'hui cinquante chez Bluesky et quinze dans le flux Atom, soit
 * soixante-cinq pour cent. Monter Bluesky à cent ferait moissonner cent quinze
 * publications pour en garder cent : la purge supprimerait à chaque tour ce que
 * le suivant recollecterait, et la base tournerait en rond deux fois par jour.
 */
export const GAME_SOCIAL_KEEP = 100;

/** Ce que la section de la fiche montre, avant le lien « voir tout ». */
export const SOCIAL_SECTION_LIMIT = 12;

/**
 * La borne d'une lecture, ou `null` quand il n'y a rien à lire.
 *
 * Deux pièges se croisent ici, et un seul `Math.max` n'en évite qu'un.
 * `limit(0)` chez MongoDB ne veut pas dire « aucun document » mais **« aucune
 * borne »** — donc la collection entière ; une borne négative y veut dire « au
 * plus tant, puis ferme le curseur ». Relever le plancher à un écarte ces deux
 * lectures, mais rend alors **une** publication là où l'appelant n'en demandait
 * aucune : la garde qui protège la base ment à l'appelant.
 *
 * D'où `null`. « Combien lire ? » n'a pas de réponse en nombre quand la réponse
 * est « rien » — l'appelant rend une liste vide sans toucher la base, ce qui est
 * à la fois exact et moins cher.
 */
function borneLecture(limit: number): number | null {
  const borne = Math.min(Math.floor(limit), GAME_SOCIAL_KEEP);

  // `NaN > 0` est faux, ce qui range aussi une borne illisible du bon côté.
  return borne > 0 ? borne : null;
}

function toGameSocialPost(doc: WithId<Document>): GameSocialPost {
  return {
    id: doc._id.toString(),
    gameId: doc.gameId,
    platform: doc.platform as SocialPlatform,
    kind: doc.kind as SocialPostKind,
    externalId: doc.externalId,
    url: doc.url,
    account: doc.account as SocialAccount,
    text: doc.text || undefined,
    thumbnail: doc.thumbnail || undefined,
    publishedAt: doc.publishedAt,
    durationSeconds: typeof doc.durationSeconds === "number" ? doc.durationSeconds : undefined,
    hiddenAt: doc.hiddenAt || undefined,
    hiddenBy: doc.hiddenBy || undefined,
    collectedAt: doc.collectedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Range ce qu'un tour vient de moissonner.
 *
 * Un `bulkWrite` plutôt qu'une boucle : une chaîne rend quinze à cinquante
 * publications, dont la quasi-totalité était déjà là au tour précédent.
 *
 * Rend le nombre de documents **créés**, et non le nombre d'écritures : c'est
 * la seule mesure qui dise quelque chose au compte rendu du cron. Un second
 * tour sur un catalogue inchangé doit rendre zéro, et c'est le test
 * d'idempotence.
 */
export async function upsertGameSocialPosts(
  gameId: string,
  posts: CollectedSocialPost[],
): Promise<number> {
  if (posts.length === 0) {
    return 0;
  }

  const now = new Date().toISOString();

  const operations: AnyBulkWriteOperation<Document>[] = posts.map((post) => ({
    updateOne: {
      filter: { gameId, platform: post.platform, externalId: post.externalId },
      update: {
        // `hiddenAt` et `hiddenBy` n'apparaissent dans aucune des deux clauses.
        // Ce n'est pas un oubli : c'est la garantie du masquage. Voir le
        // commentaire de tête.
        $set: {
          kind: post.kind,
          url: post.url,
          account: post.account,
          text: post.text,
          thumbnail: post.thumbnail,
          publishedAt: post.publishedAt,
          durationSeconds: post.durationSeconds,
          updatedAt: now,
        },
        $setOnInsert: {
          gameId,
          platform: post.platform,
          externalId: post.externalId,
          // `collectedAt` date la **découverte**, et n'est donc écrit qu'ici.
          // Le mettre dans `$set` le ferait dériver — mais chez Bluesky
          // seulement, dont le flux entier est relu à chaque tour, là où
          // YouTube n'interroge que les vidéos inconnues. Deux plateformes,
          // deux sémantiques pour un même champ : le pire des deux mondes.
          collectedAt: post.collectedAt,
          createdAt: now,
        },
      },
      upsert: true,
    },
  }));

  const result = await collection.bulkWrite(operations, { ordered: false });

  return result.upsertedCount;
}

/** Ce que les vitrines montrent : les plus récentes, masquées exclues. */
export async function listGameSocialPosts(
  gameId: string,
  limit: number = GAME_SOCIAL_KEEP,
): Promise<GameSocialPost[]> {
  const borne = borneLecture(limit);
  if (borne === null) {
    return [];
  }

  const docs = await collection
    .find({ gameId, hiddenAt: null })
    .sort({ publishedAt: -1 })
    .limit(borne)
    .toArray();

  return docs.map(toGameSocialPost);
}

/**
 * Ce qu'un administrateur voit : les masquées comprises.
 *
 * **Deux lectures, et non une seule bornée.** Une lecture unique triée par date
 * et coupée à cent laisserait une publication masquée un peu ancienne sortir de
 * la fenêtre dès qu'assez de publications visibles plus récentes s'accumulent —
 * elle deviendrait introuvable, donc impossible à réafficher, et le masquage
 * serait irréversible par accident. Relever la borne ne ferait que repousser la
 * falaise.
 *
 * Les masquées sont donc lues **toutes**, sans borne : elles se comptent en
 * gestes de modération, c'est-à-dire en presque rien, et l'index
 * `{ gameId, hiddenAt, publishedAt }` sert exactement cette question.
 *
 * La fusion se trie par comparaison de chaînes, ce qui est licite ici et
 * seulement ici : `publishedAt` est normalisé en UTC sous une forme unique
 * (`lib/social/instants.ts`), si bien que l'ordre lexicographique **est**
 * l'ordre chronologique.
 */
export async function listGameSocialPostsWithHidden(
  gameId: string,
  limit: number = GAME_SOCIAL_KEEP,
): Promise<GameSocialPost[]> {
  const borne = borneLecture(limit);

  const [visible, hidden] = await Promise.all([
    // La borne ne concerne que les visibles ; les masquées se lisent toutes,
    // pour la raison dite plus haut. Une borne nulle rend donc la seule liste
    // de modération, ce qui est ce que l'appelant a demandé.
    borne === null
      ? Promise.resolve<WithId<Document>[]>([])
      : collection
          .find({ gameId, hiddenAt: null })
          .sort({ publishedAt: -1 })
          .limit(borne)
          .toArray(),
    collection.find({ gameId, hiddenAt: { $ne: null } }).sort({ publishedAt: -1 }).toArray(),
  ]);

  return [...visible, ...hidden]
    .map(toGameSocialPost)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
}

/**
 * Les publications les plus récentes, **tous jeux confondus**.
 *
 * Ce que lit le fil de l'accueil, là où `listGameSocialPosts` sert la fiche
 * d'un jeu. La distinction n'est pas cosmétique : le fil mêle plusieurs jeux et
 * doit donc trier entre eux, ce qu'une boucle de lectures par jeu ne saurait
 * faire sans tout rapatrier.
 *
 * `gameIds` vide veut dire **« aucun jeu »**, et rend donc une liste vide —
 * contrairement à `undefined`, qui ne filtre pas. C'est la même distinction que
 * `listLiveGameStreams`, et pour la même raison : « cette personne ne suit
 * aucun jeu » et « on ne filtre pas » ne demandent pas la même réponse.
 */
export async function listRecentSocialPosts({
  gameIds,
  limit = 12,
}: { gameIds?: string[]; limit?: number } = {}): Promise<GameSocialPost[]> {
  const borne = borneLecture(limit);
  if (borne === null || (gameIds && gameIds.length === 0)) {
    return [];
  }

  const docs = await collection
    .find({ hiddenAt: null, ...(gameIds ? { gameId: { $in: gameIds } } : {}) })
    .sort({ publishedAt: -1 })
    .limit(borne)
    .toArray();

  return docs.map(toGameSocialPost);
}

/**
 * Les identifiants déjà connus d'un jeu, pour une plateforme.
 *
 * Sert la résolution paresseuse du tour YouTube : une publication déjà rangée
 * porte sa durée, et la redemander deux fois par jour pour une valeur immuable
 * dépenserait du quota pour rien.
 */
export async function listGameSocialExternalIds(
  gameId: string,
  platform: SocialPlatform,
): Promise<Set<string>> {
  const docs = await collection
    .find({ gameId, platform }, { projection: { externalId: 1 } })
    .toArray();

  return new Set(docs.map((doc) => doc.externalId as string));
}

export async function setGameSocialPostHidden(
  id: string,
  hidden: boolean,
  byUserId: string,
): Promise<GameSocialPost | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const now = new Date().toISOString();

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    hidden
      ? { $set: { hiddenAt: now, hiddenBy: byUserId, updatedAt: now } }
      // Le champ **absent** vaut visible, comme partout dans le dépôt : on le
      // retire plutôt que d'y écrire `null`, ce qui laisserait croire à un état.
      : { $unset: { hiddenAt: "", hiddenBy: "" }, $set: { updatedAt: now } },
    { returnDocument: "after" },
  );

  return result ? toGameSocialPost(result) : null;
}

/** Le jeu auquel appartient une publication — la garde des actions d'administration. */
export async function getGameSocialPost(id: string): Promise<GameSocialPost | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const doc = await collection.findOne({ _id: new ObjectId(id) });
  return doc ? toGameSocialPost(doc) : null;
}

/**
 * Le ménage : ce dont plus aucune fiche ne parle.
 *
 * Un jeu supprimé, un fanion éteint, un lien effacé. `declared` porte les
 * couples encore vivants ; tout le reste s'en va — **sauf les masquées**, dont
 * la pierre tombale doit survivre pour que le lien remis trois jours plus tard
 * ne fasse pas réapparaître ce qu'on avait retiré.
 *
 * Un tableau vide veut bien dire « plus rien n'est déclaré », et non « ne rien
 * faire » : c'est l'état d'un site où la fonctionnalité vient d'être éteinte
 * partout.
 */
export async function deleteUndeclaredGameSocialPosts(
  declared: { gameId: string; platform: SocialPlatform }[],
): Promise<number> {
  const result = await collection.deleteMany({
    hiddenAt: null,
    ...(declared.length > 0
      ? { $nor: declared.map(({ gameId, platform }) => ({ gameId, platform })) }
      : {}),
  });

  return result.deletedCount;
}

/**
 * Les publications d'un compte que ce jeu ne suit plus.
 *
 * Appelée **après** avoir su lire la plateforme, et seulement alors : effacer
 * l'historique d'un jeu parce que l'AppView a rendu un 502 pendant deux
 * secondes coûterait bien plus que d'afficher douze heures de plus une
 * publication d'un compte qu'on vient de changer.
 */
export async function deleteGameSocialPostsOfOtherAccounts(
  gameId: string,
  platform: SocialPlatform,
  accountKey: string,
): Promise<number> {
  const result = await collection.deleteMany({
    gameId,
    platform,
    hiddenAt: null,
    "account.key": { $ne: accountKey },
  });

  return result.deletedCount;
}

/**
 * La rétention : au-delà de cent, les plus anciennes s'en vont.
 *
 * Calque de `recordActivity` (`lib/db/tournaments.ts`) — un `find` projeté puis
 * un `deleteMany`, faute de `$slice` applicable à une collection. Comme lui,
 * l'échec est journalisé sans être propagé : la rétention est un confort
 * d'exploitation, pas une opération dont dépend la collecte.
 */
export async function purgeGameSocialPosts(
  gameId: string,
  keep: number = GAME_SOCIAL_KEEP,
): Promise<number> {
  try {
    const stale = await collection
      .find({ gameId, hiddenAt: null }, { projection: { _id: 1 } })
      .sort({ publishedAt: -1 })
      .skip(keep)
      .toArray();

    if (stale.length === 0) {
      return 0;
    }

    const result = await collection.deleteMany({ _id: { $in: stale.map((doc) => doc._id) } });

    return result.deletedCount;
  } catch (error) {
    console.error("Purge des publications sociales en échec:", gameId, error);
    return 0;
  }
}
