import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  AGENT_SKILLS_PATH,
  buildSkillDocument,
  buildSkillsIndex,
  SKILL_NAMES,
  SKILLS_INDEX_SCHEMA,
} from "./agent-skills";

/**
 * Les compétences publiées et leur index (Agent Skills Discovery v0.2.0).
 *
 * Ce qui peut mentir ici est précis : une empreinte qui ne correspond pas au
 * document servi. L'agent qui vérifie l'intégrité rejette alors un document
 * parfaitement valide, et la compétence est perdue sans que personne voie
 * d'erreur nulle part.
 *
 * Exécution : `npm run test`.
 */

const ORIGIN = "https://www.joutes.app";

describe("buildSkillsIndex", () => {
  it("empreinte ce qui est réellement servi", () => {
    // Le cœur du format. Recalculé ici depuis le document, exactement comme le
    // ferait l'agent après téléchargement.
    const index = buildSkillsIndex(ORIGIN);

    for (const entry of index.skills) {
      const document = buildSkillDocument(entry.name, ORIGIN);
      assert.ok(document, `document manquant : ${entry.name}`);

      const expected = createHash("sha256").update(Buffer.from(document, "utf8")).digest("hex");
      assert.equal(entry.digest, `sha256:${expected}`, `empreinte fausse : ${entry.name}`);
    }
  });

  it("empreinte les octets UTF-8, pas les caractères", () => {
    // Les documents sont pleins d'accents : hacher la chaîne JavaScript
    // donnerait une empreinte introuvable côté agent.
    const index = buildSkillsIndex(ORIGIN);
    const document = buildSkillDocument("joutes-api", ORIGIN)!;

    assert.ok(/[éèàç]/.test(document), "document sans accent : le test ne prouve rien");
    assert.notEqual(
      index.skills.find((skill) => skill.name === "joutes-api")?.digest,
      `sha256:${createHash("sha256").update(document, "latin1").digest("hex")}`
    );
  });

  it("suit le format du RFC", () => {
    const index = buildSkillsIndex(ORIGIN);

    assert.equal(index.$schema, SKILLS_INDEX_SCHEMA);
    assert.ok(index.skills.length > 0);

    for (const entry of index.skills) {
      assert.match(entry.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, `nom hors format : ${entry.name}`);
      assert.ok(entry.name.length <= 64);
      assert.equal(entry.type, "skill-md");
      assert.ok(entry.description.length > 0 && entry.description.length <= 1024);
      assert.match(entry.digest, /^sha256:[0-9a-f]{64}$/);
      assert.equal(entry.url, `${ORIGIN}${AGENT_SKILLS_PATH}/${entry.name}/SKILL.md`);
    }
  });

  it("suit l'origine qui le sert", () => {
    // Les documents changent avec l'origine, donc les empreintes aussi : c'est
    // précisément pourquoi elles ne peuvent pas être écrites à la main.
    const local = buildSkillsIndex("http://localhost:3000");
    const production = buildSkillsIndex(ORIGIN);

    assert.ok(local.skills[0].url.startsWith("http://localhost:3000/"));
    assert.notEqual(local.skills[0].digest, production.skills[0].digest);
  });
});

describe("buildSkillDocument", () => {
  it("ouvre chaque document par l'en-tête que le format exige", () => {
    for (const name of SKILL_NAMES) {
      const document = buildSkillDocument(name, ORIGIN)!;
      const [dashes, nameLine] = document.split("\n");

      assert.equal(dashes, "---", `${name} : pas d'en-tête YAML`);
      assert.equal(nameLine, `name: ${name}`, `${name} : nom absent de l'en-tête`);
      assert.ok(document.includes("\ndescription: "), `${name} : description absente`);
    }
  });

  it("annonce la même description que l'index", () => {
    // Deux formulations divergentes laisseraient l'agent choisir laquelle croire.
    for (const entry of buildSkillsIndex(ORIGIN).skills) {
      const document = buildSkillDocument(entry.name, ORIGIN)!;

      assert.ok(
        document.includes(`description: ${entry.description}`),
        `description divergente : ${entry.name}`
      );
    }
  });

  it("ignore un nom qui n'est pas publié", () => {
    // La route en fait un 404 : un document vide servi en 200 se recopierait.
    assert.equal(buildSkillDocument("joutes-inventee", ORIGIN), null);
    assert.equal(buildSkillDocument("../auth.md", ORIGIN), null);
  });

  it("ne renvoie que vers des chemins que le site sert", () => {
    // Une compétence qui pointe vers un 404 coûte plus que pas de compétence.
    const served = new Set([
      "/api",
      "/api/docs",
      "/api/health",
      "/auth.md",
      "/mcp",
      "/cgu",
      "/account/integrations",
      "/.well-known/api-catalog",
      "/.well-known/mcp/server-card.json",
      `${AGENT_SKILLS_PATH}/joutes-card-search/SKILL.md`,
    ]);

    for (const name of SKILL_NAMES) {
      const document = buildSkillDocument(name, ORIGIN)!;

      for (const [link] of document.matchAll(new RegExp(`${ORIGIN}(/[^\\s)\`,]*)`, "g"))) {
        const path = link.slice(ORIGIN.length).replace(/[.,]$/, "");
        // Les gabarits d'URL (`{gameId}`) décrivent une forme, pas une cible.
        if (path.includes("{") || path.includes("?")) continue;
        assert.ok(served.has(path), `chemin non servi cité par ${name} : ${path}`);
      }
    }
  });
});
