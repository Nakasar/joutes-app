/**
 * Ce que Joutes expose aux agents, et où ils le trouvent.
 *
 * Deux formes du même inventaire, tenues côte à côte pour ne pas diverger :
 * l'en-tête `Link` de l'accueil (RFC 8288), qui se lit sans télécharger la
 * page, et le catalogue d'API servi sur `/.well-known/api-catalog`
 * (RFC 9727), qui détaille chaque service. Un agent qui ne connaît que le
 * premier arrive au second.
 *
 * Les types de relation sont ceux enregistrés à l'IANA — un `rel` inventé ne
 * dit rien à personne.
 */

/** Chemins annoncés. Relatifs : ils suivent le déploiement (prod, préproduction, local). */
export const ADVERTISED_PATHS = {
  catalog: "/.well-known/api-catalog",
  restApi: "/api",
  openapi: "/api/docs",
  apiDoc: "/integrations/api",
  health: "/api/health",
  // Annoncé par `agent_auth.skill` plutôt que par un lien : aucune relation
  // enregistrée ne décrit « le mode d'emploi pour obtenir un accès ». Il est
  // tenu ici pour que le test des routes existantes le couvre aussi.
  authMd: "/auth.md",
  agentSkills: "/.well-known/agent-skills/index.json",
  mcp: "/mcp",
  mcpDoc: "/integrations/mcp",
  mcpServerCard: "/.well-known/mcp/server-card.json",
  terms: "/cgu",
  privacy: "/privacy",
} as const;

/**
 * En-tête `Link` de l'accueil.
 *
 * Les titres restent en ASCII : un en-tête HTTP ne transporte pas d'accents
 * sans le détour de `title*` et de l'encodage RFC 8187. Les libellés français
 * vivent dans le catalogue, qui est du JSON en UTF-8.
 */
export const HOMEPAGE_LINK_HEADER = [
  `<${ADVERTISED_PATHS.catalog}>; rel="api-catalog"; type="application/linkset+json"`,
  `<${ADVERTISED_PATHS.openapi}>; rel="service-desc"; type="application/json"; title="Joutes API (OpenAPI 3.1)"`,
  `<${ADVERTISED_PATHS.apiDoc}>; rel="service-doc"; type="text/html"; title="Joutes API documentation"`,
  `<${ADVERTISED_PATHS.terms}>; rel="terms-of-service"`,
  `<${ADVERTISED_PATHS.privacy}>; rel="privacy-policy"`,
].join(", ");

/** Un lien du catalogue, tel que le décrit le format linkset (RFC 9264). */
type CatalogLink = {
  href: string;
  type?: string;
  title?: string;
};

/** Une API du catalogue : son URI, puis ses liens rangés par type de relation. */
type CatalogEntry = {
  anchor: string;
} & Record<string, CatalogLink[] | string>;

export type ApiCatalog = { linkset: CatalogEntry[] };

/** Type de média du catalogue, imposé par la RFC 9727. */
export const API_CATALOG_MEDIA_TYPE = "application/linkset+json";

/**
 * Catalogue des API, ancré sur l'origine qui le sert : les URI y sont absolues,
 * pour rester valides une fois le document recopié ailleurs.
 */
export function buildApiCatalog(origin: string): ApiCatalog {
  const url = (path: string) => new URL(path, origin).toString();

  return {
    linkset: [
      {
        anchor: url(ADVERTISED_PATHS.restApi),
        "service-desc": [
          {
            href: url(ADVERTISED_PATHS.openapi),
            type: "application/json",
            title: "Description OpenAPI 3.1 de l'API Joutes",
          },
        ],
        "service-doc": [
          {
            href: url(ADVERTISED_PATHS.apiDoc),
            type: "text/html",
            title: "Documentation développeurs et API",
          },
        ],
        // Un agent qui reçoit une erreur a besoin de savoir si c'est lui ou
        // nous, sans quoi il réessaie à l'aveugle ou abandonne à tort.
        status: [
          {
            href: url(ADVERTISED_PATHS.health),
            type: "application/health+json",
            title: "État de santé de l'API Joutes",
          },
        ],
        "terms-of-service": [{ href: url(ADVERTISED_PATHS.terms) }],
        "privacy-policy": [{ href: url(ADVERTISED_PATHS.privacy) }],
      },
      {
        anchor: url(ADVERTISED_PATHS.mcp),
        // La carte du serveur (SEP-1649) : son nom, sa version et son
        // transport, lisibles sans ouvrir de session MCP. Elle ne liste pas
        // les outils — `tools/list` le fait, et à jour.
        "service-desc": [
          {
            href: url(ADVERTISED_PATHS.mcpServerCard),
            type: "application/json",
            title: "Carte du serveur MCP de Joutes",
          },
        ],
        "service-doc": [
          {
            href: url(ADVERTISED_PATHS.mcpDoc),
            type: "text/html",
            title: "Serveur MCP de Joutes",
          },
        ],
        // Même sonde que l'API REST : le serveur MCP est servi par le même
        // déploiement et lit la même base. Ce qui vaut pour l'une vaut pour
        // l'autre.
        status: [
          {
            href: url(ADVERTISED_PATHS.health),
            type: "application/health+json",
            title: "État de santé de l'API Joutes",
          },
        ],
        "terms-of-service": [{ href: url(ADVERTISED_PATHS.terms) }],
        "privacy-policy": [{ href: url(ADVERTISED_PATHS.privacy) }],
      },
    ],
  };
}
