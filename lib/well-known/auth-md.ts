/**
 * Comment un agent obtient un accès à Joutes, et où il l'apprend.
 *
 * Deux formes du même mode d'emploi, tenues côte à côte pour ne pas diverger :
 * `/auth.md`, le document que l'agent lit et exécute, et le bloc `agent_auth`
 * des métadonnées du serveur d'autorisation (RFC 8414), qui l'annonce à qui
 * n'a trouvé que le `.well-known`.
 *
 * Aucune URL d'OAuth n'est réécrite ici : elles sortent toutes des métadonnées
 * produites par better-auth. Les recopier, c'est se donner rendez-vous avec le
 * jour où un endpoint bouge et où le mode d'emploi envoie l'agent dans le mur.
 */

/** Le mode d'emploi lui-même, vers lequel pointe `agent_auth.skill`. */
export const AUTH_MD_PATH = "/auth.md";

/** Où un humain crée, relit et désactive les clés API de ses agents. */
export const API_KEYS_PATH = "/account/integrations";

/** Le serveur MCP, seul endroit où un jeton OAuth de Joutes est accepté. */
export const MCP_PATH = "/mcp";

/** L'API REST et sa description, que la clé API ouvre. */
export const REST_API_PATH = "/api";
export const OPENAPI_PATH = "/api/docs";

/** Sonde d'état, à consulter avant de conclure à une panne de son côté. */
export const HEALTH_PATH = "/api/health";

export const AUTH_MD_MEDIA_TYPE = "text/markdown; charset=utf-8";

/**
 * Ce que le serveur MCP exige d'un jeton, mot pour mot.
 *
 * Constantes, et non valeurs dérivées de l'origine de la requête :
 * `app/mcp/route.ts` vérifie ces trois-là en dur, si bien qu'un document servi
 * depuis une préproduction et qui annoncerait son propre domaine enverrait
 * l'agent demander un jeton que la vérification rejette. Elles sont ici pour
 * que le serveur et son mode d'emploi ne puissent pas se contredire.
 *
 * La barre finale de l'audience n'est pas une coquille : c'est la valeur
 * configurée dans `validAudiences`, et un jeton demandé sans elle est refusé.
 */
export const MCP_TOKEN = {
  issuer: "https://www.joutes.app/api/auth",
  audience: "https://www.joutes.app/",
  jwksUri: "https://www.joutes.app/api/auth/jwks",
} as const;

/**
 * Ce que ce module lit dans les métadonnées du serveur d'autorisation. Tout
 * est optionnel : better-auth n'annonce un endpoint que s'il l'expose, et une
 * étape sans endpoint ne doit pas être écrite plutôt qu'écrite au conditionnel.
 */
export type AuthServerMetadata = {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
  jwks_uri?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
};

export type AgentAuth = {
  skill: string;
  identity_types_supported: string[];
  credential_types_supported: string[];
  credential_delivery: string;
  user_credential_uri: string;
  register_uri?: string;
  claim_uri?: string;
  revocation_uri?: string;
};

/**
 * Bloc `agent_auth`, greffé sur les métadonnées du serveur d'autorisation.
 *
 * Joutes n'implémente pas de cérémonie d'identité dédiée : sa revendication,
 * c'est l'écran de consentement OAuth. Un client enregistré dynamiquement
 * existe sans appartenir à personne — `anonymous` — jusqu'à ce qu'un
 * utilisateur l'y autorise. Nommer cet écran `claim_uri` décrit ce qui se
 * passe vraiment ; inventer un `/agent/identity` qui n'existe pas ferait
 * échouer l'agent une étape plus loin.
 */
export function buildAgentAuth(metadata: AuthServerMetadata, origin: string): AgentAuth {
  const url = (path: string) => new URL(path, origin).toString();

  return {
    skill: url(AUTH_MD_PATH),
    identity_types_supported: ["anonymous"],
    credential_types_supported: ["oauth_access_token", "api_key"],
    credential_delivery: "authorization_header_bearer",
    user_credential_uri: url(API_KEYS_PATH),
    // Absents des métadonnées, ces endpoints ne sont pas annoncés : mieux vaut
    // une étape manquante qu'une étape fausse.
    ...(metadata.registration_endpoint ? { register_uri: metadata.registration_endpoint } : {}),
    ...(metadata.authorization_endpoint ? { claim_uri: metadata.authorization_endpoint } : {}),
    ...(metadata.revocation_endpoint ? { revocation_uri: metadata.revocation_endpoint } : {}),
  };
}

/** Une étape que ses endpoints rendent impossible n'est pas écrite du tout. */
function section(available: boolean, body: string): string {
  return available ? body : "";
}

/**
 * Le document `/auth.md`. Le titre de niveau 1 porte le nom du format : c'est
 * à lui qu'un agent reconnaît qu'il est tombé sur un mode d'emploi et pas sur
 * une page d'accueil renvoyée par un 404 déguisé.
 *
 * Rédigé en anglais, à l'inverse du reste du site. Ce document n'a pas de
 * lecteur humain : il est exécuté par des agents tiers, dont l'outillage est
 * bâti sur une spécification anglophone — « register », « claim »,
 * « credential ». En français, il gardait la bonne structure mais aucun de ces
 * repères, et les vérificateurs de conformité ne le reconnaissaient pas comme
 * un mode d'emploi d'enregistrement. Le contenu prime sur la cohérence
 * stylistique quand le lecteur est une machine qui ne lit qu'un vocabulaire.
 */
export function buildAuthMd(metadata: AuthServerMetadata, origin: string): string {
  const url = (path: string) => new URL(path, origin).toString();
  const oauthUsable = Boolean(
    metadata.registration_endpoint && metadata.authorization_endpoint && metadata.token_endpoint
  );

  return [
    `# auth.md`,
    ``,
    `Not an agent? Humans do not need this document: create your own API key at`,
    `${url(API_KEYS_PATH)}.`,
    ``,
    `You are an agent. This document tells you how to register with Joutes and`,
    `obtain a credential for its REST API and its MCP server. Follow the steps in`,
    `order; do not skip ahead.`,
    ``,
    `Joutes catalogues trading card games, their cards, the events and venues that`,
    `host them, and what each player collects.`,
    ``,
    `## Credentials Joutes accepts`,
    ``,
    // Le tableau est assemblé à part : une ligne vide au milieu casserait sa
    // mise en forme, et le resserrage des blancs ne rattrape pas ce cas-là.
    // Annoncer la voie OAuth quand le serveur ne l'expose pas enverrait par
    // ailleurs l'agent vers des étapes que ce document ne décrit même pas.
    [
      `| Credential | How you get it | What it opens |`,
      `| --- | --- | --- |`,
      oauthUsable
        ? `| OAuth 2.0 access token | Path A — the agent registers itself, then a user claims it | the MCP server (\`${MCP_PATH}\`) |`
        : null,
      `| API key \`jts_…\` | Path B — a user creates one and hands it over | the REST API (\`${REST_API_PATH}\`) **and** the MCP server |`,
    ]
      .filter(Boolean)
      .join("\n"),
    ``,
    `Both are presented the same way:`,
    ``,
    "```http",
    `Authorization: Bearer <credential>`,
    "```",
    ``,
    `**An OAuth access token does not work on the REST API.** It authenticates`,
    `\`jts_…\` API keys and browser sessions only. This is the most expensive`,
    `surprise in this API: an agent that needs the REST API must take Path B.`,
    ``,
    section(
      oauthUsable,
      [
        `## Path A — Agent registration with OAuth 2.0`,
        ``,
        `### Step 1 — Register the client`,
        ``,
        `Dynamic client registration (RFC 7591) is open: no prior credential, no`,
        `application form, no account.`,
        ``,
        "```http",
        `POST ${metadata.registration_endpoint}`,
        `Content-Type: application/json`,
        ``,
        `{`,
        `  "client_name": "Your agent's name",`,
        `  "redirect_uris": ["https://your-agent.example/callback"],`,
        `  "grant_types": ["authorization_code", "refresh_token"],`,
        `  "response_types": ["code"],`,
        `  "token_endpoint_auth_method": "none"`,
        `}`,
        "```",
        ``,
        `The response carries a \`client_id\`. Persist it — it cannot be looked up`,
        `again.`,
        ``,
        `### Step 2 — Claim ceremony: have a user authorize the agent`,
        ``,
        `A registered client belongs to nobody and opens nothing. It becomes useful`,
        `when a Joutes user claims it on the consent screen. Send the user here, in`,
        `their browser:`,
        ``,
        "```",
        `${metadata.authorization_endpoint}`,
        `  ?response_type=code`,
        `  &client_id=<client_id>`,
        `  &redirect_uri=<one of the registered redirect_uris>`,
        `  &scope=${(metadata.scopes_supported ?? []).join("%20")}`,
        `  &state=<random value bound to your session>`,
        `  &code_challenge=<S256(code_verifier)>`,
        `  &code_challenge_method=S256`,
        "```",
        ``,
        `PKCE is not optional${
          metadata.code_challenge_methods_supported?.length
            ? `: ${metadata.code_challenge_methods_supported.join(", ")} is the only method advertised`
            : ""
        }.`,
        `Check \`state\` on the way back; skipping that means accepting a third`,
        `party's code.`,
        ``,
        `### Step 3 — Exchange the code for a credential`,
        ``,
        "```http",
        `POST ${metadata.token_endpoint}`,
        `Content-Type: application/x-www-form-urlencoded`,
        ``,
        `grant_type=authorization_code`,
        `&code=<the code you received>`,
        `&redirect_uri=<the same one as in Step 2>`,
        `&client_id=<client_id>`,
        `&code_verifier=<code_verifier>`,
        "```",
        ``,
        `With the \`offline_access\` scope the response also carries a`,
        `\`refresh_token\`, which is what saves you from asking the user again at`,
        `every expiry.`,
        ``,
        `### Step 4 — Use the credential`,
        ``,
        "```http",
        `POST ${url(MCP_PATH)}`,
        `Authorization: Bearer <access_token>`,
        `Content-Type: application/json`,
        "```",
        ``,
        `Every request is verified against \`${MCP_TOKEN.jwksUri}\`, for audience`,
        `\`${MCP_TOKEN.audience}\` and issuer \`${MCP_TOKEN.issuer}\`. These three do not`,
        `follow the domain serving this document: request a token for any other`,
        `audience and it is rejected on use.`,
        ``,
        section(
          Boolean(metadata.revocation_endpoint),
          [
            `### Step 5 — Revoke the credential`,
            ``,
            "```http",
            `POST ${metadata.revocation_endpoint}`,
            `Content-Type: application/x-www-form-urlencoded`,
            ``,
            `token=<access_token or refresh_token>&client_id=<client_id>`,
            "```",
            ``,
            `An agent that is done hands back what it was given. The user can also`,
            `withdraw consent at any time from ${url(API_KEYS_PATH)} — treat a sudden`,
            `401 as a revocation, not an outage.`,
            ``,
          ].join("\n")
        ),
      ].join("\n")
    ),
    `## Path B — User-provisioned API key`,
    ``,
    `The user creates the key themselves at ${url(API_KEYS_PATH)} and hands it to`,
    `the agent. Nothing to register, nothing to claim: the key already carries`,
    `their account.`,
    ``,
    "```http",
    `GET ${url(REST_API_PATH)}/...`,
    `Authorization: Bearer jts_…`,
    "```",
    ``,
    `What the REST API exposes is described in OpenAPI 3.1: ${url(OPENAPI_PATH)}.`,
    `The same key also works on the MCP server (\`${MCP_PATH}\`).`,
    ``,
    `A key does not expire on its own. It is deactivated from the page that`,
    `created it, and a deactivated key returns 401 on the very next request.`,
    ``,
    `## Errors`,
    ``,
    `| Status | What it means | What to do |`,
    `| --- | --- | --- |`,
    `| 401 | Credential missing, expired, revoked, or of a type this route does not accept | Refresh the token; if refreshing also fails, ask for authorization again. Do not retry as-is. |`,
    `| 403 | Credential valid, but the account lacks the right | Do not retry: this is a decision, not an incident. |`,
    `| 404 | Absent, or not visible to this account | Do not retry. |`,
    `| 5xx | Our fault | Read ${url(HEALTH_PATH)}, then retry with backoff. |`,
    ``,
    `A transport error is not an authentication error. Before redoing the whole`,
    `ceremony, read ${url(HEALTH_PATH)}, which answers \`pass\` or \`fail\` without any`,
    `credential.`,
    ``,
    `## See also`,
    ``,
    `- API catalogue: ${url("/.well-known/api-catalog")}`,
    `- OpenAPI description: ${url(OPENAPI_PATH)}`,
    `- Agent skills index: ${url("/.well-known/agent-skills/index.json")}`,
    `- MCP server card: ${url("/.well-known/mcp/server-card.json")}`,
    `- Terms of service: ${url("/cgu")}`,
    `- Privacy policy: ${url("/privacy")}`,
    ``,
  ]
    .join("\n")
    // Une section écartée laisse sa ligne vide derrière elle : sans ce
    // resserrage, le document se retrouve troué de blancs triples.
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}
