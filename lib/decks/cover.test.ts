import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deckCoverCandidates,
  deckCoverImage,
  deckCoverPosition,
  isDeckCoverImageUrl,
  resolveDeckCover,
} from "@/lib/decks/cover";
import type { DeckCardInfo, DeckCards } from "@/lib/decks/contents";
import { getDeckZones } from "@/lib/decks/zones";

const riftbound = getDeckZones({ slug: "riftbound" });

const CATALOG = new Map<string, DeckCardInfo>([
  ["l1", { id: "l1", name: "Voix de la Faille", image: "https://cartes.test/l1.png" }],
  ["c1", { id: "c1", name: "Kaelis", image: "https://cartes.test/c1.png" }],
  ["m1", { id: "m1", name: "Éclat de Faille" }],
]);

describe("resolveDeckCover", () => {
  it("préfère l'image déposée à toute carte", () => {
    const cover = resolveDeckCover(
      {
        coverImageUrl: "https://x.public.blob.vercel-storage.com/decks/1/cover.png",
        coverCardId: "c1",
        legendCardId: "l1",
      },
      CATALOG
    );

    assert.equal(cover.source, "upload");
    assert.equal(cover.image, "https://x.public.blob.vercel-storage.com/decks/1/cover.png");
    assert.equal(cover.cardId, undefined);
  });

  it("prend la carte désignée avant la légende", () => {
    const cover = resolveDeckCover({ coverCardId: "c1", legendCardId: "l1" }, CATALOG);

    assert.equal(cover.source, "card");
    assert.equal(cover.cardId, "c1");
    assert.equal(cover.image, "https://cartes.test/c1.png");
  });

  it("retombe sur la légende quand rien n'est désigné", () => {
    const cover = resolveDeckCover({ legendCardId: "l1" }, CATALOG);

    assert.equal(cover.source, "legend");
    assert.equal(cover.image, "https://cartes.test/l1.png");
  });

  it("lit la valeur dénormalisée quand le catalogue n'est pas là", () => {
    // Le cas d'une liste : elle n'a pas résolu les cartes du deck, et
    // `coverImage` est justement ce qui lui évite de le faire.
    const cover = resolveDeckCover({
      coverCardId: "c1",
      coverImage: "https://cartes.test/c1.png",
    });

    assert.equal(cover.source, "card");
    assert.equal(cover.image, "https://cartes.test/c1.png");
  });

  it("ne rend pas d'image pour une carte sans illustration", () => {
    assert.equal(deckCoverImage({ coverCardId: "m1" }, CATALOG), undefined);
  });

  it("rend une couverture vide pour un deck qui n'a rien", () => {
    const cover = resolveDeckCover({}, CATALOG);

    assert.equal(cover.source, "none");
    assert.equal(cover.image, undefined);
  });
});

describe("deckCoverCandidates", () => {
  it("suit l'ordre des zones et non celui de la saisie", () => {
    const cards: DeckCards = {
      maindeck: [
        { cardId: "m1", quantity: 3 },
        { cardId: "m2", quantity: 2 },
      ],
      legend: [{ cardId: "l1", quantity: 1 }],
      champions: [{ cardId: "c1", quantity: 3 }],
    };

    assert.deepEqual(deckCoverCandidates(cards, riftbound), ["l1", "c1", "m1", "m2"]);
  });

  it("ne propose qu'une fois une carte jouée dans deux zones", () => {
    const cards: DeckCards = {
      maindeck: [{ cardId: "m1", quantity: 3 }],
      sideboard: [{ cardId: "m1", quantity: 2 }],
    };

    assert.deepEqual(deckCoverCandidates(cards, riftbound), ["m1"]);
  });

  it("rend une liste vide pour un deck sans cartes", () => {
    assert.deepEqual(deckCoverCandidates(undefined, riftbound), []);
  });
});

describe("deckCoverPosition", () => {
  it("cadre une illustration de carte par le haut et une image déposée au centre", () => {
    assert.equal(deckCoverPosition("card"), "top");
    assert.equal(deckCoverPosition("legend"), "top");
    assert.equal(deckCoverPosition("upload"), "center");
  });
});

describe("isDeckCoverImageUrl", () => {
  it("accepte le stockage de l'application", () => {
    assert.equal(
      isDeckCoverImageUrl("https://uiez8a3cxaj4q4wl.public.blob.vercel-storage.com/decks/1/a.png"),
      true
    );
  });

  it("refuse un hôte tiers, le http simple et ce qui n'est pas une adresse", () => {
    assert.equal(isDeckCoverImageUrl("https://exemple.test/a.png"), false);
    assert.equal(
      isDeckCoverImageUrl("http://x.public.blob.vercel-storage.com/decks/1/a.png"),
      false
    );
    assert.equal(isDeckCoverImageUrl("javascript:alert(1)"), false);
    assert.equal(isDeckCoverImageUrl("pas une adresse"), false);
  });

  it("refuse un hôte qui imite le suffixe du stockage", () => {
    // `endsWith` sans le point initial laisserait passer
    // `evilpublic.blob.vercel-storage.com.attaquant.test`.
    assert.equal(
      isDeckCoverImageUrl("https://public.blob.vercel-storage.com.attaquant.test/a.png"),
      false
    );
  });
});
