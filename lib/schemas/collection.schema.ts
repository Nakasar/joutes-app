import { z } from "zod";

export const cardCondition = z.enum(["Damaged", "Played", "Good", "Near Mint", "Mint"]);

export const collectionCardSchema = z.strictObject({
    name: z.string().min(1).max(200),
    cardId: z.string().min(1).max(100),
    setCode: z.string().min(1).max(100),
    collectorNumber: z.string().min(1).max(100),
    image: z.string(),
    foil: z.boolean().optional(),
    language: z.string().max(50).optional(),
    condition: cardCondition.optional(),
    grade: z.number().min(0).max(10).optional(),
});
