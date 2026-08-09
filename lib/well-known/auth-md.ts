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
 */
export function buildAuthMd(metadata: AuthServerMetadata, origin: string): string {
  const url = (path: string) => new URL(path, origin).toString();
  const oauthUsable = Boolean(
    metadata.registration_endpoint && metadata.authorization_endpoint && metadata.token_endpoint
  );

  return [
    `# auth.md`,
    ``,
    `Ce document dit à un agent comment obtenir un accès programmatique à Joutes.`,
    `Un humain n'en a pas besoin : ses clés se créent depuis ${url(API_KEYS_PATH)}.`,
    ``,
    `Les étapes se suivent dans l'ordre.`,
    ``,
    `## Ce que Joutes accepte`,
    ``,
    `| Identifiant | Comment l'obtenir | Ce qu'il ouvre |`,
    `| --- | --- | --- |`,
    `| Jeton d'accès OAuth 2.0 | voie A — l'agent s'enregistre, un utilisateur l'autorise | le serveur MCP (\`${MCP_PATH}\`) |`,
    `| Clé API \`jts_…\` | voie B — un utilisateur la crée et la confie à l'agent | l'API REST (\`${REST_API_PATH}\`) **et** le serveur MCP |`,
    ``,
    `Les deux se présentent de la même façon :`,
    ``,
    "```http",
    `Authorization: Bearer <identifiant>`,
    "```",
    ``,
    `Un jeton OAuth ne vaut pas pour l'API REST : elle n'authentifie que les clés`,
    `\`jts_…\` et les sessions de navigateur. Un agent qui veut l'API REST prend la`,
    `voie B.`,
    ``,
    section(
      oauthUsable,
      [
        `## Voie A — OAuth 2.0, pour un agent autonome`,
        ``,
        `### Étape 1 — S'enregistrer comme client`,
        ``,
        `L'enregistrement dynamique (RFC 7591) est ouvert : aucun identifiant`,
        `préalable, aucun dossier à déposer.`,
        ``,
        "```http",
        `POST ${metadata.registration_endpoint}`,
        `Content-Type: application/json`,
        ``,
        `{`,
        `  "client_name": "Nom de votre agent",`,
        `  "redirect_uris": ["https://votre-agent.example/callback"],`,
        `  "grant_types": ["authorization_code", "refresh_token"],`,
        `  "response_types": ["code"],`,
        `  "token_endpoint_auth_method": "none"`,
        `}`,
        "```",
        ``,
        `La réponse porte un \`client_id\`. Le conserver : il ne se retrouve pas.`,
        ``,
        `### Étape 2 — Faire revendiquer l'agent par un utilisateur`,
        ``,
        `Un client enregistré n'appartient encore à personne et n'ouvre rien. Il`,
        `prend sa valeur quand un utilisateur de Joutes l'autorise, sur l'écran de`,
        `consentement. Envoyer l'utilisateur ici, dans son navigateur :`,
        ``,
        "```",
        `${metadata.authorization_endpoint}`,
        `  ?response_type=code`,
        `  &client_id=<client_id>`,
        `  &redirect_uri=<une des redirect_uris enregistrées>`,
        `  &scope=${(metadata.scopes_supported ?? []).join("%20")}`,
        `  &state=<aléa lié à la session>`,
        `  &code_challenge=<S256(code_verifier)>`,
        `  &code_challenge_method=S256`,
        "```",
        ``,
        `PKCE n'est pas facultatif${
          metadata.code_challenge_methods_supported?.length
            ? ` : ${metadata.code_challenge_methods_supported.join(", ")} est la seule méthode annoncée`
            : ""
        }.`,
        `Vérifier \`state\` au retour ; ne pas le faire, c'est accepter le code d'un tiers.`,
        ``,
        `### Étape 3 — Échanger le code contre un jeton`,
        ``,
        "```http",
        `POST ${metadata.token_endpoint}`,
        `Content-Type: application/x-www-form-urlencoded`,
        ``,
        `grant_type=authorization_code`,
        `&code=<code reçu>`,
        `&redirect_uri=<la même qu'à l'étape 2>`,
        `&client_id=<client_id>`,
        `&code_verifier=<code_verifier>`,
        "```",
        ``,
        `Avec le scope \`offline_access\`, la réponse porte aussi un \`refresh_token\` :`,
        `c'est lui qui évite de redemander l'utilisateur à chaque expiration.`,
        ``,
        `### Étape 4 — Utiliser le jeton`,
        ``,
        "```http",
        `POST ${url(MCP_PATH)}`,
        `Authorization: Bearer <access_token>`,
        `Content-Type: application/json`,
        "```",
        ``,
        `Le jeton est vérifié à chaque requête contre \`${MCP_TOKEN.jwksUri}\`, pour`,
        `l'audience \`${MCP_TOKEN.audience}\` et l'émetteur \`${MCP_TOKEN.issuer}\`.`,
        `Ces trois valeurs ne suivent pas le domaine qui sert ce document : demander`,
        `le jeton pour une autre audience, c'est se le faire rejeter à l'usage.`,
        ``,
        section(
          Boolean(metadata.revocation_endpoint),
          [
            `### Étape 5 — Rendre le jeton`,
            ``,
            "```http",
            `POST ${metadata.revocation_endpoint}`,
            `Content-Type: application/x-www-form-urlencoded`,
            ``,
            `token=<access_token ou refresh_token>&client_id=<client_id>`,
            "```",
            ``,
            `Un agent qui a fini rend ce qu'il a reçu. L'utilisateur, de son côté,`,
            `peut retirer son accord à tout moment depuis ${url(API_KEYS_PATH)} :`,
            `traiter un 401 soudain comme un retrait, pas comme une panne.`,
            ``,
          ].join("\n")
        ),
      ].join("\n")
    ),
    `## Voie B — Clé API, pour un agent conduit par un utilisateur`,
    ``,
    `L'utilisateur crée la clé lui-même depuis ${url(API_KEYS_PATH)} et la confie à`,
    `l'agent. Rien à enregistrer, rien à revendiquer : la clé porte déjà son`,
    `compte.`,
    ``,
    "```http",
    `GET ${url(REST_API_PATH)}/...`,
    `Authorization: Bearer jts_…`,
    "```",
    ``,
    `Ce que l'API REST expose est décrit en OpenAPI 3.1 : ${url(OPENAPI_PATH)}.`,
    `La même clé vaut pour le serveur MCP (\`${MCP_PATH}\`).`,
    ``,
    `Une clé n'expire pas d'elle-même. Elle se désactive depuis la page qui l'a`,
    `créée, et une clé désactivée répond 401 dès la requête suivante.`,
    ``,
    `## Erreurs`,
    ``,
    `| Code | Ce que ça veut dire | Que faire |`,
    `| --- | --- | --- |`,
    `| 401 | Identifiant absent, expiré, révoqué ou d'un autre type que la route accepte | Rafraîchir le jeton ; si le rafraîchissement échoue aussi, redemander l'autorisation. Ne pas réessayer tel quel. |`,
    `| 403 | Identifiant valide, mais le compte n'a pas le droit demandé | Ne pas réessayer : c'est une décision, pas un incident. |`,
    `| 404 | Ressource absente ou non visible de ce compte | Ne pas réessayer. |`,
    `| 5xx | Panne de notre côté | Vérifier ${url(HEALTH_PATH)}, puis réessayer avec un délai croissant. |`,
    ``,
    `Une erreur de transport n'est pas une erreur d'authentification : avant de`,
    `refaire toute la cérémonie, lire ${url(HEALTH_PATH)}, qui répond \`pass\` ou`,
    `\`fail\` sans identifiant.`,
    ``,
    `## Voir aussi`,
    ``,
    `- Catalogue des API : ${url("/.well-known/api-catalog")}`,
    `- Description OpenAPI : ${url(OPENAPI_PATH)}`,
    `- Documentation développeurs : ${url("/integrations/api")}`,
    `- Conditions d'utilisation : ${url("/cgu")}`,
    `- Politique de confidentialité : ${url("/privacy")}`,
    ``,
  ]
    .join("\n")
    // Une section écartée laisse sa ligne vide derrière elle : sans ce
    // resserrage, le document se retrouve troué de blancs triples.
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}
