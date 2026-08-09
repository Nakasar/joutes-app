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
  mcp: "/mcp",
  mcpDoc: "/integrations/mcp",
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
        "terms-of-service": [{ href: url(ADVERTISED_PATHS.terms) }],
        "privacy-policy": [{ href: url(ADVERTISED_PATHS.privacy) }],
      },
      {
        // Le serveur MCP n'a pas de description lisible par machine : son
        // protocole se découvre à l'appel. Reste son URI, que ce catalogue est
        // le seul endroit à donner sans lire une page.
        anchor: url(ADVERTISED_PATHS.mcp),
        "service-doc": [
          {
            href: url(ADVERTISED_PATHS.mcpDoc),
            type: "text/html",
            title: "Serveur MCP de Joutes",
          },
        ],
        "terms-of-service": [{ href: url(ADVERTISED_PATHS.terms) }],
        "privacy-policy": [{ href: url(ADVERTISED_PATHS.privacy) }],
      },
    ],
  };
}
