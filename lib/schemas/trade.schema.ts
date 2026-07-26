import { z } from "zod";

/**
 * Une carte cédée est désignée par l'identité dénormalisée sur
 * `collection-cards` (nom + extension + numéro), une carte reçue par son id de
 * catalogue — le serveur en relit les données avant insertion.
 */
export const tradeOfferedItemSchema = z.strictObject({
  name: z.string().min(1).max(200),
  setCode: z.string().min(1).max(100),
  collectorNumber: z.string().min(1).max(100),
  quantity: z.number().int().min(1).max(99),
});

export const tradeReceivedItemSchema = z.strictObject({
  cardId: z.string().min(1).max(100),
  quantity: z.number().int().min(1).max(99),
});

export const tradeSchema = z
  .strictObject({
    offered: z.array(tradeOfferedItemSchema).max(50).default([]),
    received: z.array(tradeReceivedItemSchema).max(50).default([]),
  })
  .refine(
    (trade) => trade.offered.length + trade.received.length > 0,
    "Un échange doit porter sur au moins une carte"
  );

export type TradeOfferedItemInput = z.infer<typeof tradeOfferedItemSchema>;
export type TradeReceivedItemInput = z.infer<typeof tradeReceivedItemSchema>;
export type TradeInput = z.infer<typeof tradeSchema>;
