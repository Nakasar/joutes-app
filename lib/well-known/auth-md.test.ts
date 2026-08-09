import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  API_KEYS_PATH,
  buildAgentAuth,
  buildAuthMd,
  MCP_TOKEN,
  type AuthServerMetadata,
} from "./auth-md";

/**
 * Ce que Joutes dit à un agent qui cherche un accès : le document `/auth.md`
 * et le bloc `agent_auth` des métadonnées du serveur d'autorisation.
 *
 * L'enjeu est le même que pour le catalogue d'API : une consigne fausse coûte
 * plus cher que pas de consigne. Un agent qui suit une étape vers un endpoint
 * absent a déjà enregistré un client, ouvert une fenêtre à un utilisateur, et
 * échoue à la dernière ligne.
 *
 * Exécution : `npm run test`.
 */

/** Les métadonnées que better-auth produit aujourd'hui, en réduction. */
const METADATA: AuthServerMetadata = {
  issuer: "https://www.joutes.app/api/auth",
  authorization_endpoint: "https://www.joutes.app/api/auth/oauth2/authorize",
  token_endpoint: "https://www.joutes.app/api/auth/oauth2/token",
  registration_endpoint: "https://www.joutes.app/api/auth/oauth2/register",
  revocation_endpoint: "https://www.joutes.app/api/auth/oauth2/revoke",
  jwks_uri: "https://www.joutes.app/api/auth/jwks",
  scopes_supported: ["openid", "profile", "email", "offline_access"],
  code_challenge_methods_supported: ["S256"],
};

const ORIGIN = "https://www.joutes.app";

describe("buildAgentAuth", () => {
  it("mène au mode d'emploi et à l'enregistrement", () => {
    const agentAuth = buildAgentAuth(METADATA, ORIGIN);

    assert.equal(agentAuth.skill, "https://www.joutes.app/auth.md");
    assert.equal(agentAuth.register_uri, METADATA.registration_endpoint);
    assert.equal(agentAuth.claim_uri, METADATA.authorization_endpoint);
    assert.equal(agentAuth.revocation_uri, METADATA.revocation_endpoint);
  });

  it("reprend les endpoints du serveur au lieu de les réécrire", () => {
    // La dérive est le risque réel : un endpoint qui bouge dans better-auth
    // doit bouger ici sans que personne y pense.
    const moved = buildAgentAuth(
      { ...METADATA, registration_endpoint: "https://www.joutes.app/ailleurs/register" },
      ORIGIN
    );

    assert.equal(moved.register_uri, "https://www.joutes.app/ailleurs/register");
  });

  it("tait une étape que le serveur n'expose pas", () => {
    // Mieux vaut un bloc incomplet qu'un bloc qui promet un endpoint absent.
    const withoutRegistration = buildAgentAuth(
      { ...METADATA, registration_endpoint: undefined, revocation_endpoint: undefined },
      ORIGIN
    );

    assert.ok(!("register_uri" in withoutRegistration));
    assert.ok(!("revocation_uri" in withoutRegistration));
    assert.equal(withoutRegistration.skill, "https://www.joutes.app/auth.md");
  });

  it("dit de quoi l'agent peut se réclamer et comment le présenter", () => {
    const agentAuth = buildAgentAuth(METADATA, ORIGIN);

    assert.deepEqual(agentAuth.identity_types_supported, ["anonymous"]);
    assert.deepEqual(agentAuth.credential_types_supported, ["oauth_access_token", "api_key"]);
    assert.equal(agentAuth.credential_delivery, "authorization_header_bearer");
    assert.equal(agentAuth.user_credential_uri, `${ORIGIN}${API_KEYS_PATH}`);
  });
});

describe("buildAuthMd", () => {
  it("s'annonce par un titre que l'agent reconnaît", () => {
    // Sans ce titre, rien ne distingue le document d'une page d'erreur servie
    // en 200 : c'est à lui que le scanner et l'agent s'accrochent.
    const document = buildAuthMd(METADATA, ORIGIN);

    assert.equal(document.split("\n")[0], "# auth.md");
  });

  it("porte les endpoints du serveur, pas des URL recopiées", () => {
    const document = buildAuthMd(METADATA, ORIGIN);

    for (const endpoint of [
      METADATA.registration_endpoint,
      METADATA.authorization_endpoint,
      METADATA.token_endpoint,
      METADATA.revocation_endpoint,
    ]) {
      assert.ok(document.includes(endpoint!), `absent du document : ${endpoint}`);
    }
  });

  it("annonce l'audience que le serveur MCP vérifie, pas celle du domaine servant", () => {
    // `app/mcp/route.ts` vérifie ces valeurs en dur : un document de
    // préproduction qui annoncerait son propre domaine ferait demander un
    // jeton rejeté à la première requête.
    const document = buildAuthMd(
      { ...METADATA, issuer: "https://preview.joutes.app/api/auth" },
      "https://preview.joutes.app"
    );

    assert.ok(document.includes(MCP_TOKEN.audience));
    assert.ok(document.includes(MCP_TOKEN.jwksUri));
    assert.ok(document.includes(MCP_TOKEN.issuer));
  });

  it("suit l'origine qui le sert", () => {
    // Servi aussi en préproduction et en local, où le domaine de production
    // enverrait l'agent authentifier une autre instance que celle qu'il vise.
    const document = buildAuthMd(
      {
        ...METADATA,
        authorization_endpoint: "http://localhost:3000/api/auth/oauth2/authorize",
        token_endpoint: "http://localhost:3000/api/auth/oauth2/token",
        registration_endpoint: "http://localhost:3000/api/auth/oauth2/register",
      },
      "http://localhost:3000"
    );

    assert.ok(document.includes("http://localhost:3000/mcp"));
    assert.ok(!document.includes("https://www.joutes.app/mcp"));
  });

  it("n'écrit pas l'étape OAuth quand le serveur ne la permet pas", () => {
    // Un document qui déroule un enregistrement dynamique absent fait échouer
    // l'agent après qu'il a déjà dérangé un utilisateur.
    const document = buildAuthMd({ ...METADATA, registration_endpoint: undefined }, ORIGIN);

    assert.ok(!document.includes("Path A"));
    // La voie qui reste, elle, doit toujours être là.
    assert.ok(document.includes("Path B"));
    assert.ok(document.includes(`${ORIGIN}${API_KEYS_PATH}`));
  });

  it("ne laisse pas de blancs triples derrière une section écartée", () => {
    const document = buildAuthMd({ ...METADATA, revocation_endpoint: undefined }, ORIGIN);

    assert.equal(document.match(/\n{3,}/), null);
  });

  it("dit que le jeton OAuth ne vaut pas pour l'API REST", () => {
    // C'est la surprise la plus coûteuse de cette API : la distinction est la
    // raison d'être du document.
    const document = buildAuthMd(METADATA, ORIGIN);

    assert.ok(document.includes("Authorization: Bearer"));
    assert.ok(/does not work on the REST API/.test(document));
  });

  it("emploie le vocabulaire d'enregistrement de la spécification", () => {
    // Le document n'a pas de lecteur humain : il est lu par des agents dont
    // l'outillage cherche ces mots-là. Rédigé en français, il gardait la bonne
    // structure sans aucun de ces repères, et les vérificateurs de conformité
    // ne le reconnaissaient pas comme un mode d'emploi d'enregistrement.
    const document = buildAuthMd(METADATA, ORIGIN).toLowerCase();

    for (const marker of ["register", "registration", "claim", "credential", "agent"]) {
      assert.ok(document.includes(marker), `repère absent du document : ${marker}`);
    }
  });
});
