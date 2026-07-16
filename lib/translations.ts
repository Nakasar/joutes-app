/**
 * Merges an incoming set of translations with the previously stored ones,
 * keeping each translation's existing `updatedAt` timestamp when its
 * translatable text hasn't actually changed, and stamping it with `now`
 * otherwise (new or edited translation). This avoids marking every
 * translation as freshly updated just because the edit form was resubmitted.
 */
export function mergeTranslationTimestamps<T extends { lang: string }>(
  existing: (T & { updatedAt: Date })[] | undefined,
  incoming: T[],
  isEqual: (a: T, b: T) => boolean,
  now: Date = new Date()
): (T & { updatedAt: Date })[] {
  return incoming.map((translation) => {
    const prior = existing?.find((e) => e.lang === translation.lang);
    const unchanged = prior && isEqual(prior, translation);
    return { ...translation, updatedAt: unchanged ? prior.updatedAt : now };
  });
}
