import { z } from "zod";

export const playGroupGamesSchema = z.strictObject({
  /** `null` re-enables every game for the group; an array restricts it to those game ids. */
  enabledGameIds: z.array(z.string().min(1).max(100)).max(500).nullable(),
});
