/**
 * Les pipelines d'échantillonnage des boosters de collection, isolés de Mongo
 * pour être testés sans base : `lib/db/boosters.ts` les joue tels quels.
 *
 * Règle de Mongo à ne pas enfreindre : dans un `$project`, seule `_id` peut être
 * exclue quand d'autres champs sont inclus — mélanger exclusions et inclusions
 * fait échouer toute l'agrégation (« Cannot do inclusion on field … in exclusion
 * projection »).
 */

/** Les champs gardés sur chaque carte d'un booster tiré. */
export const SAMPLED_CARD_PROJECTION = {
  _id: 0,
  cardId: 1,
  setCode: 1,
  collectorNumber: 1,
  foil: 1,
} as const;

/**
 * Le pipeline d'un tirage au hasard (`$sample`) de boosters, avec leurs cartes
 * réduites à l'identité (identifiant ou impression, et brillant).
 */
export function sampleBoostersPipeline(query: Record<string, unknown>, count: number): Record<string, unknown>[] {
  return [
    { $match: query },
    { $sample: { size: count } },
    {
      $lookup: {
        from: "booster-cards",
        localField: "_id",
        foreignField: "boosterId",
        as: "cards",
        pipeline: [{ $project: SAMPLED_CARD_PROJECTION }],
      },
    },
  ];
}

/**
 * Le pipeline des types de boosters d'un utilisateur, avec le nombre
 * d'exemplaires de chaque type et le détail par extension, en un aller-retour.
 */
export function boosterTypeCountsPipeline(query: Record<string, unknown>): Record<string, unknown>[] {
  return [
    { $match: query },
    { $group: { _id: { type: "$type", set: "$setCode" }, count: { $sum: 1 } } },
  ];
}
