import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { accountInitials } from "./initials";

/**
 * Les initiales affichées dans l'en-tête quand le compte n'a pas d'avatar.
 *
 * Exécution : `npm run test`.
 */

describe("accountInitials", () => {
  it("prend une lettre par mot, deux au plus", () => {
    assert.equal(accountInitials("Kevin Thizy"), "KT");
    assert.equal(accountInitials("Jean Pierre De La Tour"), "JP");
  });

  it("rend une seule lettre pour un nom d'un seul mot", () => {
    assert.equal(accountInitials("kaelis"), "K");
  });

  it("ne garde que la partie locale d'une adresse e-mail", () => {
    assert.equal(accountInitials("nakasar@gmail.com"), "N");
    assert.equal(accountInitials("jean.dupont@example.org"), "JD");
  });

  it("traite les séparateurs d'un identifiant comme des espaces", () => {
    assert.equal(accountInitials("jean_dupont"), "JD");
    assert.equal(accountInitials("  Sylve  Lune "), "SL");
  });

  it("ne rend rien plutôt que de la ponctuation", () => {
    assert.equal(accountInitials("!!!"), "");
    assert.equal(accountInitials(""), "");
    assert.equal(accountInitials(null), "");
    assert.equal(accountInitials(undefined), "");
  });
});
