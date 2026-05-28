import { z } from "zod";

export const collectionCardSchema = z.strictObject({
    name: z.string().min(1).max(200),
    cardId: z.string().min(1).max(100),
    setCode: z.string().min(1).max(100),
    collectorNumber: z.string().min(1).max(100),
    image: z.string(),
})