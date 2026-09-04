import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quizCoverPosition, resolveQuizCover } from "./cover";

/**
 * La couverture d'un quizz, telle qu'un écran l'affiche.
 *
 * Ce que ces cas verrouillent : la liste et la fiche montrent la même image du
 * même quizz — l'une en lisant la valeur dénormalisée, l'autre l'illustration
 * fraîche de la carte —, et l'image déposée l'emporte sur la carte désignée.
 *
 * Exécution : `npm run test`.
 */

describe("resolveQuizCover", () => {
  it("rend l'image déposée, qui prime sur la carte", () => {
    const cover = resolveQuizCover({
      coverImageUrl: "https://x.public.blob.vercel-storage.com/quizzes/covers/a.png",
      coverCardId: "OGN-001",
      coverImage: "https://cartes.test/ogn-001.png",
    });

    assert.equal(cover.source, "upload");
    assert.equal(cover.image, "https://x.public.blob.vercel-storage.com/quizzes/covers/a.png");
  });

  it("rend l'illustration fraîche de la carte quand le catalogue est là", () => {
    const cover = resolveQuizCover(
      { coverCardId: "OGN-001", coverImage: "https://cartes.test/ancienne.png" },
      "https://cartes.test/fraiche.png",
    );

    assert.equal(cover.source, "card");
    assert.equal(cover.cardId, "OGN-001");
    assert.equal(cover.image, "https://cartes.test/fraiche.png");
  });

  it("retombe sur la valeur dénormalisée sans catalogue", () => {
    const cover = resolveQuizCover({ coverCardId: "OGN-001", coverImage: "https://cartes.test/ogn-001.png" });

    assert.equal(cover.source, "card");
    assert.equal(cover.image, "https://cartes.test/ogn-001.png");
  });

  it("ne montre rien quand rien n'a été choisi", () => {
    const cover = resolveQuizCover({});

    assert.equal(cover.source, "none");
    assert.equal(cover.image, undefined);
  });

  it("ignore une valeur dérivée restée seule", () => {
    // Un quizz dont la couverture vient d'être retirée : la valeur dénormalisée
    // ne doit pas continuer à l'illustrer.
    const cover = resolveQuizCover({ coverImage: "https://cartes.test/ogn-001.png" });

    assert.equal(cover.source, "none");
    assert.equal(cover.image, undefined);
  });
});

describe("quizCoverPosition", () => {
  it("cadre une carte par le haut et une image déposée par son centre", () => {
    assert.equal(quizCoverPosition("card"), "top");
    assert.equal(quizCoverPosition("upload"), "center");
  });
});
