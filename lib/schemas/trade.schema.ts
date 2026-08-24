import { z } from "zod";
import { TRADE_MAX_CARDS_PER_SIDE, TRADE_MAX_QUANTITY, TRADE_MAX_UNIT_PRICE } from "@/lib/constants/trade";

/**
 * Les cartes d'une offre ne sont jamais insérées telles quelles : le serveur les
 * relit depuis la collection de leur propriétaire (face d'un participant) ou
 * depuis le catalogue (contrepartie libre). Ces schémas ne valident donc que la
 * désignation des cartes, pas leurs données.
 *
 *  - face d'un participant : identité dénormalisée sur `collection-cards`
 *    (nom + extension + numéro), comme partout ailleurs dans la collection ;
 *  - contrepartie libre : identifiant de catalogue `cards.id`.
 */
/**
 * Prix négocié d'une carte, à l'unité. Facultatif : sans lui, c'est le prix de
 * marché relevé qui s'applique, et `null` revient à l'effacer.
 */
const tradeUnitPriceSchema = z.number().min(0).max(TRADE_MAX_UNIT_PRICE).nullish();

export const tradeOwnedCardSchema = z.strictObject({
  name: z.string().min(1).max(200),
  setCode: z.string().min(1).max(100),
  collectorNumber: z.string().min(1).max(100),
  quantity: z.number().int().min(1).max(TRADE_MAX_QUANTITY),
  unitPrice: tradeUnitPriceSchema,
});

export const tradeCatalogCardSchema = z.strictObject({
  cardId: z.string().min(1).max(100),
  quantity: z.number().int().min(1).max(TRADE_MAX_QUANTITY),
  unitPrice: tradeUnitPriceSchema,
});

export const tradeOfferUpdateSchema = z.discriminatedUnion("target", [
  z.strictObject({
    target: z.literal("mine"),
    cards: z.array(tradeOwnedCardSchema).max(TRADE_MAX_CARDS_PER_SIDE),
  }),
  z.strictObject({
    target: z.literal("counterparty"),
    cards: z.array(tradeCatalogCardSchema).max(TRADE_MAX_CARDS_PER_SIDE),
  }),
]);

/**
 * Désignation d'une carte lue dans une liste écrite en texte : le nom, et ce
 * qui la précise quand la ligne le dit (cf. `lib/trade/text.ts`). Le serveur en
 * tire une impression réelle ; rien n'est enregistré à ce stade.
 */
export const tradeCardResolveSchema = z.strictObject({
  scope: z.enum(["collection", "catalog"]),
  cards: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(200),
        setCode: z.string().max(100).optional(),
        collectorNumber: z.string().max(100).optional(),
      })
    )
    // Ce qui dépasse la taille d'une face ne sera de toute façon pas retenu.
    .max(TRADE_MAX_CARDS_PER_SIDE),
});

export const tradeJoinSchema = z.strictObject({
  code: z.string().trim().min(1).max(32),
});

/** Tag `pseudo#1234`, nom d'utilisateur ou adresse e-mail du partenaire. */
export const tradePartnerSchema = z.strictObject({
  identifier: z.string().trim().min(1).max(200),
});

export const tradeValidateSchema = z.strictObject({
  revision: z.number().int().min(0),
});

export type TradeOfferUpdateInput = z.infer<typeof tradeOfferUpdateSchema>;
export type TradeCardResolveInput = z.infer<typeof tradeCardResolveSchema>;
export type TradeJoinInput = z.infer<typeof tradeJoinSchema>;
export type TradePartnerInput = z.infer<typeof tradePartnerSchema>;
export type TradeValidateInput = z.infer<typeof tradeValidateSchema>;
