import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readEventManageState, writeEventManageState } from "./manage-state.ts";

describe("état des onglets d'organisation", () => {
  it("part de l'aperçu", () => {
    assert.deepEqual(readEventManageState(new URLSearchParams()), {
      tab: "overview",
      query: "",
      status: "all",
      page: 1,
      pageSize: 10,
    });
  });

  it("relit ce qu'il écrit", () => {
    const state = { tab: "participants" as const, query: "lyra", status: "PRE_REGISTERED" as const, page: 3, pageSize: 25 };
    const params = writeEventManageState(state);
    assert.equal(params.toString(), "tab=participants&q=lyra&status=PRE_REGISTERED&page=3&size=25");
    assert.deepEqual(readEventManageState(params), state);
  });

  it("écarte les valeurs inconnues", () => {
    const state = readEventManageState(new URLSearchParams("tab=rondes&status=VIP&size=7"));
    assert.equal(state.tab, "overview");
    assert.equal(state.status, "all");
    assert.equal(state.pageSize, 10);
  });

  it("n'écrit la recherche que pour l'onglet des inscrits", () => {
    const params = writeEventManageState({ tab: "waitlist", query: "lyra", status: "EXCLUDED", page: 2, pageSize: 50 });
    assert.equal(params.toString(), "tab=waitlist");
  });
});
