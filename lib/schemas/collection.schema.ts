import { z } from "zod";
import { PAINT_STATE_KEYS } from "@/lib/constants/paint-states";

export const cardCondition = z.enum(["Damaged", "Played", "Good", "Near Mint", "Mint"]);
export const collectionLanguage = z.enum(["FR", "EN", "ZH", "IT", "JA", "KO"]);
export const collectionCurrency = z.enum(["EUR", "USD", "GBP", "JPY", "CNY"]);

/**
 * Les types déduits vivent ici, auprès des énumérations dont ils sortent.
 * `lib/collection/formats/types.ts` les redéclarait pour son propre usage : il
 * les réexporte désormais, pour qu'une valeur ajoutée à une énumération n'ait
 * qu'un seul endroit où être écrite.
 */
export type CardCondition = z.infer<typeof cardCondition>;
export type CollectionLanguage = z.infer<typeof collectionLanguage>;
export type CollectionCurrency = z.infer<typeof collectionCurrency>;

export const collectionCardSchema = z.strictObject({
    name: z.string().min(1).max(200),
    cardId: z.string().min(1).max(100),
    setCode: z.string().min(1).max(100),
    collectorNumber: z.string().min(1).max(100),
    image: z.string(),
    foil: z.boolean().optional(),
    /** Variante d'impression choisie ; absente = version de base de la carte. */
    printingId: z.string().min(1).max(64).optional(),
    printingName: z.string().min(1).max(100).optional(),
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

export const productPaintState = z.enum(PAINT_STATE_KEYS);

/**
 * Ajout d'un exemplaire de produit à une collection.
 *
 * Divergence assumée avec `collectionCardSchema` : ni nom, ni image, ni gamme
 * dans la charge utile. L'ajout d'une carte fait confiance au client pour ses
 * champs dénormalisés ; ici le serveur les relit depuis le catalogue. La requête
 * est plus légère, et personne ne peut inscrire un faux nom dans une collection.
 */
export const collectionProductSchema = z.strictObject({
    productId: z.string().min(1).max(64),
    /**
     * Verser aussi le contenu du produit (défaut : oui). Sans effet sur un
     * produit sans contenu.
     */
    addContents: z.boolean().optional(),
    /**
     * Contenu à verser, quand l'utilisateur en a décoché une partie — une boîte
     * d'occasion arrive souvent incomplète. Absent = tout le contenu.
     */
    contents: z.array(z.string().min(1).max(64)).max(200).optional(),
    paintState: productPaintState.optional(),
    sealed: z.boolean().optional(),
    obtainedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    acquisitionPrice: z.number().min(0).optional(),
    acquisitionCurrency: collectionCurrency.optional(),
    note: z.string().trim().max(200).optional(),
});

/**
 * Modification d'un exemplaire. `detach` sort la figurine de la boîte qui l'a
 * apportée : elle survivra au retrait de cette boîte. L'opération est à sens
 * unique, il n'existe pas de rattachement.
 */
export const collectionProductPatchSchema = z.strictObject({
    paintState: productPaintState.nullable().optional(),
    sealed: z.boolean().optional(),
    obtainedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    acquisitionPrice: z.number().min(0).nullable().optional(),
    acquisitionCurrency: collectionCurrency.nullable().optional(),
    note: z.string().trim().max(200).nullable().optional(),
    borrowedBy: z.string().trim().min(1).max(100).nullable().optional(),
    detach: z.literal(true).optional(),
});
