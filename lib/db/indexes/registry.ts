import type { IndexDefinition } from "./ensure";
import { CARD_INDEXES } from "./cards";
import { EVENT_INDEXES } from "./events";
import { TOURNAMENT_INDEXES } from "./tournaments";
import { USER_INDEXES } from "./users";

/**
 * Tous les index que `npm run indexes` pose (voir `scripts/db/indexes.ts`).
 *
 * Pour en ajouter un : le déclarer dans le fichier de son domaine, avec la
 * requête qu'il sert dans `why`, puis relancer le script. Les clés suivent la
 * règle Égalité → Tri → Intervalle. Un `$or` n'utilise un index que si chacune
 * de ses branches en a un.
 *
 * Les nouveaux index ne sont pas uniques, même là où les données le
 * permettraient : un index unique est refusé dès qu'un doublon existe déjà, et
 * c'est une décision à prendre après avoir regardé la base. Seuls le sont ceux
 * que le code déclarait déjà comme tels.
 */
export const INDEXES: IndexDefinition[] = [...EVENT_INDEXES, ...TOURNAMENT_INDEXES, ...CARD_INDEXES, ...USER_INDEXES];
