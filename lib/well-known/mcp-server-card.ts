import { API_KEYS_PATH, AUTH_MD_PATH, MCP_PATH } from "@/lib/well-known/auth-md";

/**
 * La carte du serveur MCP (SEP-1649 / SEP-2127), pour qu'un client sache à
 * quoi il se connecte avant de s'y connecter.
 *
 * Jusqu'ici, le serveur ne se décrivait qu'à l'appel : il fallait ouvrir une
 * session MCP pour apprendre son nom, sa version et son transport. La carte
 * dit tout cela en un GET, sans poignée de main.
 *
 * Ce qu'elle ne dit pas, et volontairement : la liste des outils. La
 * spécification écarte les primitives — « a static document cannot reliably
 * represent this surface » — et elle a raison. Vingt-sept noms recopiés ici
 * seraient faux au premier outil ajouté ; `tools/list` les donne à jour et
 * gratuitement une fois la session ouverte.
 */

/**
 * Ce que le serveur annonce de lui-même à l'initialisation.
 *
 * `app/mcp/route.ts` passe cet objet à `createMcpHandler` : la carte et la
 * poignée de main disent ainsi le même nom et la même version. Deux valeurs
 * tenues séparément auraient fini par se contredire, et un client qui compare
 * les deux n'a aucune raison de trancher en faveur de l'une.
 */
export const MCP_SERVER_INFO = {
  name: "Joutes APP",
  version: "1.0.0",
} as const;

/**
 * Identité de la carte, en DNS inversé comme l'exige le schéma — distincte du
 * nom d'affichage que porte `serverInfo`.
 */
export const MCP_CARD_NAME = "app.joutes/mcp";

export const MCP_SERVER_CARD_MEDIA_TYPE = "application/json";

/** Le schéma dont cette carte suit la forme, encore à l'état d'extension. */
const CARD_SCHEMA =
  "https://raw.githubusercontent.com/modelcontextprotocol/experimental-ext-server-card/main/schema.json";

/** Le champ `description` du schéma est borné à 100 caractères. */
const DESCRIPTION = "Serveur MCP de Joutes : évènements, collections, listes de souhaits, tournois et règles.";

export type McpServerCard = {
  $schema: string;
  name: string;
  title: string;
  description: string;
  version: string;
  websiteUrl: string;
  serverInfo: { name: string; version: string };
  capabilities: Record<string, Record<string, boolean>>;
  remotes: Array<{
    type: string;
    url: string;
    headers?: Array<{
      name: string;
      description: string;
      isRequired: boolean;
      isSecret: boolean;
      placeholder?: string;
    }>;
  }>;
  documentation: Record<string, string>;
};

/**
 * Carte ancrée sur l'origine qui la sert, comme le catalogue d'API : elle reste
 * juste en préproduction et en local, où le domaine de production ne mène pas
 * au serveur qu'on interroge.
 */
export function buildMcpServerCard(origin: string): McpServerCard {
  const url = (path: string) => new URL(path, origin).toString();

  return {
    $schema: CARD_SCHEMA,
    name: MCP_CARD_NAME,
    title: "Joutes",
    description: DESCRIPTION,
    version: MCP_SERVER_INFO.version,
    websiteUrl: url("/"),
    // Repris mot pour mot de ce que renvoie `initialize`.
    serverInfo: { ...MCP_SERVER_INFO },
    // Recopié de ce que `initialize` renvoie, vérifié en appelant le serveur :
    // `{"tools":{"listChanged":true}}`. Le SDK MCP annonce `listChanged` à
    // vrai par défaut, et la carte n'a pas à le contredire — c'est la poignée
    // de main qui fait foi auprès du client, pas nous.
    //
    // Ni ressources ni prompts : leurs clés absentes se lisent, en MCP,
    // « non pris en charge », ce qui est exact — le serveur n'en enregistre
    // aucun.
    capabilities: {
      tools: { listChanged: true },
    },
    remotes: [
      {
        type: "streamable-http",
        url: url(MCP_PATH),
        // Le jeton n'est pas exigé : les outils de lecture répondent sans lui.
        // Il ouvre ceux qui touchent au compte — collection, listes de
        // souhaits, tournois.
        headers: [
          {
            name: "Authorization",
            description:
              "Clé API « jts_… » ou jeton d'accès OAuth. Sans elle, seuls les outils de lecture publique répondent.",
            isRequired: false,
            isSecret: true,
            placeholder: "Bearer jts_…",
          },
        ],
      },
    ],
    // Comment obtenir ce jeton, justement.
    documentation: {
      auth: url(AUTH_MD_PATH),
      credentials: url(API_KEYS_PATH),
      overview: url("/integrations/mcp"),
    },
  };
}
