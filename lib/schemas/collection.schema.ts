import { z } from "zod";

export const cardCondition = z.enum(["Damaged", "Played", "Good", "Near Mint", "Mint"]);
export const collectionLanguage = z.enum(["FR", "EN", "ZH", "IT", "JA", "KO"]);
export const collectionCurrency = z.enum(["EUR", "USD", "GBP", "JPY", "CNY"]);

export const collectionCardSchema = z.strictObject({
    name: z.string().min(1).max(200),
    cardId: z.string().min(1).max(100),
    setCode: z.string().min(1).max(100),
    collectorNumber: z.string().min(1).max(100),
    image: z.string(),
    foil: z.boolean().optional(),
    language: collectionLanguage.optional(),
    condition: cardCondition.optional(),
    grade: z.number().min(0).max(10).optional(),
    obtainedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    acquisitionPrice: z.number().min(0).optional(),
    acquisitionCurrency: collectionCurrency.optional(),
});

export const collectionCardBorrowSchema = z.strictObject({
    entryId: z.string().min(1).max(100),
    borrowedBy: z.string().trim().min(1).max(100).nullable(),
});
