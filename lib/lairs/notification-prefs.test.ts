import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptsLairNotification,
  followerAudienceFilter,
  followerNotificationBranches,
  lairNotificationPreference,
  parseLairNotificationPreference,
  toStoredLairNotificationPref,
  type LairNotificationPreference,
  type StoredLairNotificationPref,
} from "./notification-prefs";

const PREFS: StoredLairNotificationPref[] = [
  { lairId: "muted", level: "none" },
  { lairId: "picky", level: "custom", categories: ["live"] },
  { lairId: "empty", level: "custom", categories: [] },
];

describe("réglage d'un lieu", () => {
  it("vaut « tout » sans réglage enregistré", () => {
    assert.deepEqual(lairNotificationPreference(undefined, "l1"), { level: "all" });
    assert.deepEqual(lairNotificationPreference(PREFS, "l1"), { level: "all" });
  });

  it("relit « aucune » et « personnalisé »", () => {
    assert.deepEqual(lairNotificationPreference(PREFS, "muted"), { level: "none" });
    assert.deepEqual(lairNotificationPreference(PREFS, "picky"), { level: "custom", categories: ["live"] });
  });

  it("n'écrit rien pour « tout »", () => {
    assert.equal(toStoredLairNotificationPref("l1", { level: "all" }), null);
    assert.deepEqual(toStoredLairNotificationPref("l1", { level: "none" }), { lairId: "l1", level: "none" });
  });
});

describe("validation", () => {
  it("accepte les trois niveaux", () => {
    assert.deepEqual(parseLairNotificationPreference({ level: "all" }), { level: "all" });
    assert.deepEqual(parseLairNotificationPreference({ level: "none" }), { level: "none" });
    assert.deepEqual(
      parseLairNotificationPreference({ level: "custom", categories: ["live", "announcements"] }),
      { level: "custom", categories: ["announcements", "live"] }
    );
  });

  it("écarte les catégories inconnues et les doublons", () => {
    assert.deepEqual(
      parseLairNotificationPreference({ level: "custom", categories: ["live", "live", "__proto__", 3] }),
      { level: "custom", categories: ["live"] }
    );
  });

  it("refuse un niveau inconnu ou un personnalisé sans liste", () => {
    assert.equal(parseLairNotificationPreference({ level: "some" }), null);
    assert.equal(parseLairNotificationPreference({ level: "custom" }), null);
    assert.equal(parseLairNotificationPreference(null), null);
    assert.equal(parseLairNotificationPreference("all"), null);
  });
});

describe("ce qui passe", () => {
  it("« tout » laisse tout passer, même sans type", () => {
    assert.equal(acceptsLairNotification({ level: "all" }, "live"), true);
    assert.equal(acceptsLairNotification({ level: "all" }, undefined), true);
  });

  it("« aucune » ne laisse rien passer", () => {
    assert.equal(acceptsLairNotification({ level: "none" }, "announcements"), false);
  });

  it("« personnalisé » ne laisse passer que les types cochés", () => {
    const pref: LairNotificationPreference = { level: "custom", categories: ["live"] };
    assert.equal(acceptsLairNotification(pref, "live"), true);
    assert.equal(acceptsLairNotification(pref, "announcements"), false);
    assert.equal(acceptsLairNotification(pref, undefined), false);
  });
});

describe("lecture : branches d'autorisation", () => {
  it("regroupe les lieux en « tout », détaille les personnalisés, omet les muets", () => {
    const branches = followerNotificationBranches(["l1", "muted", "picky", "empty", "l2"], PREFS);
    assert.deepEqual(branches, [
      { type: "lair", target: { $in: ["followers", "all"] }, lairId: { $in: ["l1", "l2"] } },
      { type: "lair", target: { $in: ["followers", "all"] }, lairId: "picky", category: { $in: ["live"] } },
    ]);
  });

  it("ne rend aucune branche quand tout est coupé", () => {
    assert.deepEqual(followerNotificationBranches(["muted"], PREFS), []);
    assert.deepEqual(followerNotificationBranches([], PREFS), []);
  });
});

describe("envoi : filtre des comptes", () => {
  /**
   * Interprète le filtre sur un compte, comme MongoDB le ferait — assez pour
   * vérifier qu'il dit la même chose que `acceptsLairNotification`.
   */
  function matches(
    filter: ReturnType<typeof followerAudienceFilter>,
    account: { lairs: string[]; lairNotificationPrefs?: StoredLairNotificationPref[] }
  ): boolean {
    if (!account.lairs.includes(filter.lairs as string)) return false;
    const elem = (filter.lairNotificationPrefs as { $not: { $elemMatch: Record<string, unknown> } }).$not.$elemMatch;
    const refuses = (pref: StoredLairNotificationPref) => {
      if (pref.lairId !== elem.lairId) return false;
      if ("$or" in elem) {
        const category = ((elem.$or as Record<string, unknown>[])[1].categories as { $ne: string }).$ne;
        return pref.level === "none" || (pref.level === "custom" && !(pref.categories ?? []).includes(category as never));
      }
      return (elem.level as { $in: string[] }).$in.includes(pref.level);
    };
    return !(account.lairNotificationPrefs ?? []).some(refuses);
  }

  const accounts = [
    { lairs: ["l1"] },
    { lairs: ["muted"], lairNotificationPrefs: PREFS },
    { lairs: ["picky"], lairNotificationPrefs: PREFS },
    { lairs: ["empty"], lairNotificationPrefs: PREFS },
  ];

  for (const category of ["live", "announcements", undefined] as const) {
    it(`dit la même chose que la lecture (${category ?? "sans type"})`, () => {
      for (const account of accounts) {
        const lairId = account.lairs[0];
        const expected = acceptsLairNotification(
          lairNotificationPreference(account.lairNotificationPrefs, lairId),
          category
        );
        assert.equal(matches(followerAudienceFilter(lairId, category), account), expected, `${lairId}/${category}`);
      }
    });
  }
});
