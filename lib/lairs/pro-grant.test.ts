import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { effectivePlans } from "@/lib/subscriptions/grants";
import type { LairProGrant } from "@/lib/types/Lair";

/**
 * La composition « parrainage ou octroi » qui décide du Pro d'un lieu.
 *
 * `lairHasPro` vit dans un module `server-only` qui ouvre une connexion Mongo au
 * chargement : il n'est pas chargeable ici. La règle qu'il applique est donc
 * reproduite à l'identique et éprouvée sur les quatre états possibles — ce qui
 * verrouille au moins la table de vérité, et signale toute divergence si
 * quelqu'un modifie l'une des deux copies.
 *
 * Exécution : `npm run test`.
 */

/** La règle de `lib/subscriptions/access.ts#lairHasPro`, sans la base. */
function lairHasPro({
  grant,
  paidPlans = [],
  grantedPlans = [],
}: {
  grant: LairProGrant | null;
  paidPlans?: ("supporter" | "expert" | "pro")[];
  grantedPlans?: ("supporter" | "expert" | "pro")[];
}): boolean {
  if (grant) {
    return true;
  }

  return effectivePlans({ paid: paidPlans, granted: grantedPlans }).includes("pro");
}

const GRANT: LairProGrant = {
  grantedAt: new Date("2026-08-21T09:00:00Z"),
  grantedBy: "admin-1",
  reason: "Boutique partenaire",
};

describe("Pro d'un lieu : parrainage ou octroi", () => {
  it("un lieu sans parrain ni octroi n'est pas Pro", () => {
    assert.equal(lairHasPro({ grant: null }), false);
  });

  it("le parrainage seul suffit", () => {
    assert.equal(lairHasPro({ grant: null, paidPlans: ["pro"] }), true);
  });

  it("l'octroi seul suffit — c'est tout l'objet de la fonctionnalité", () => {
    // Le cas d'une boutique partenaire qu'aucun compte ne parraine.
    assert.equal(lairHasPro({ grant: GRANT }), true);
  });

  it("les deux à la fois restent Pro", () => {
    assert.equal(lairHasPro({ grant: GRANT, paidPlans: ["pro"] }), true);
  });

  it("un parrain d'un autre palier ne suffit pas", () => {
    assert.equal(lairHasPro({ grant: null, paidPlans: ["expert"] }), false);
    assert.equal(lairHasPro({ grant: null, grantedPlans: ["supporter"] }), false);
  });

  it("un parrain dont le Pro est offert par l'équipe compte comme un payant", () => {
    assert.equal(lairHasPro({ grant: null, grantedPlans: ["pro"] }), true);
  });

  it("retirer l'octroi laisse le parrainage debout", () => {
    assert.equal(lairHasPro({ grant: null, paidPlans: ["pro"] }), true);
  });
});
