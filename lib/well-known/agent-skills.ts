import { createHash } from "node:crypto";

import {
  API_KEYS_PATH,
  AUTH_MD_PATH,
  HEALTH_PATH,
  MCP_PATH,
  OPENAPI_PATH,
  REST_API_PATH,
} from "@/lib/well-known/auth-md";

/**
 * Les compétences que Joutes publie pour les agents, et l'index qui les liste
 * (Agent Skills Discovery, v0.2.0).
 *
 * Un agent qui arrive ici sait appeler une API en général ; ce qu'il ignore,
 * c'est ce que celle-ci a de particulier — que la recherche de cartes accepte
 * une syntaxe à tokens, que le jeton OAuth ne vaut pas pour REST, que la
 * pagination se fait ainsi et pas autrement. Une compétence, c'est ce
 * particulier-là écrit une fois pour qu'il n'ait pas à le déduire.
 *
 * L'index porte pour chaque entrée l'empreinte SHA-256 de ce qui est servi.
 * Elle est calculée sur le document lui-même, à la demande, et non recopiée :
 * une empreinte tenue à la main serait fausse à la première correction de
 * typo, et un agent qui vérifie l'intégrité rejetterait un document parfaitement
 * valide.
 */

/** Racine des compétences, où l'index et les documents sont servis. */
export const AGENT_SKILLS_PATH = "/.well-known/agent-skills";

export const SKILLS_INDEX_SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

/** Le format impose des minuscules, des chiffres et des tirets simples. */
type SkillName = "joutes-api" | "joutes-mcp" | "joutes-card-search";

type Skill = {
  name: SkillName;
  /** Repris tel quel dans l'index et dans l'en-tête YAML du document. */
  description: string;
  build: (origin: string) => string;
};

/**
 * L'en-tête YAML que le format exige. La description y est répétée depuis la
 * même chaîne que l'index : deux formulations divergentes laisseraient l'agent
 * choisir laquelle croire.
 */
function frontMatter(skill: Pick<Skill, "name" | "description">): string {
  return ["---", `name: ${skill.name}`, `description: ${skill.description}`, "---", ""].join("\n");
}

const JOUTES_API: Skill = {
  name: "joutes-api",
  description:
    "Appeler l'API REST de Joutes : authentification par clé API, pagination, et les ressources publiques (jeux, cartes, évènements, lieux) comme celles d'un compte (collection, decks, listes de souhaits, tournois).",
  build(origin) {
    const url = (path: string) => new URL(path, origin).toString();

    return [
      frontMatter(this),
      `# API REST de Joutes`,
      ``,
      `Joutes recense des jeux de cartes, leurs cartes, les évènements et les lieux`,
      `qui les accueillent, et ce que chaque joueur en collectionne.`,
      ``,
      `## Avant d'appeler`,
      ``,
      `- Base : \`${url(REST_API_PATH)}\``,
      `- Description complète, en OpenAPI 3.1 : ${url(OPENAPI_PATH)}. **La lire avant**`,
      `  d'inventer un chemin : une centaine de routes y sont décrites avec leurs`,
      `  paramètres et leurs réponses.`,
      `- Obtenir un accès : ${url(AUTH_MD_PATH)}`,
      ``,
      `## S'authentifier`,
      ``,
      "```http",
      `Authorization: Bearer jts_…`,
      "```",
      ``,
      `La clé se crée depuis ${url(API_KEYS_PATH)}, par l'utilisateur, et vaut pour son`,
      `compte. Un **jeton OAuth ne fonctionne pas ici** : l'API REST n'authentifie que`,
      `les clés \`jts_…\` et les sessions de navigateur. C'est le piège le plus coûteux`,
      `de cette API.`,
      ``,
      `Les ressources publiques — jeux, cartes, évènements, lieux — répondent sans`,
      `aucun en-tête. N'envoyer une clé que pour ce qui touche à un compte.`,
      ``,
      `## Trouver une carte`,
      ``,
      "```http",
      `GET ${url(REST_API_PATH)}/games/{gameId}/cards?searchQuery=...&page=1&limit=50`,
      "```",
      ``,
      `\`searchQuery\` accepte une syntaxe à tokens, lue côté serveur. Voir la`,
      `compétence \`joutes-card-search\` : ${url(`${AGENT_SKILLS_PATH}/joutes-card-search/SKILL.md`)}`,
      ``,
      `\`{gameId}\` accepte l'identifiant ou le slug du jeu ; \`GET /games\` les liste.`,
      ``,
      `## Erreurs`,
      ``,
      `| Code | Sens | Que faire |`,
      `| --- | --- | --- |`,
      `| 401 | Clé absente, désactivée ou invalide | Ne pas réessayer telle quelle. |`,
      `| 403 | Clé valide, droit manquant sur cette ressource | Ne pas réessayer. |`,
      `| 404 | Absente, ou invisible pour ce compte | Ne pas réessayer. |`,
      `| 5xx | Panne de notre côté | Lire ${url(HEALTH_PATH)}, puis réessayer avec un délai croissant. |`,
      ``,
      `${url(HEALTH_PATH)} répond \`pass\` ou \`fail\` sans authentification : le consulter`,
      `avant de conclure que la faute vient de la requête.`,
      ``,
      `## Voir aussi`,
      ``,
      `- Serveur MCP, si l'agent parle MCP plutôt que HTTP : ${url(MCP_PATH)}`,
      `- Catalogue des API : ${url("/.well-known/api-catalog")}`,
      `- Conditions d'utilisation : ${url("/cgu")}`,
      ``,
    ].join("\n");
  },
};

const JOUTES_MCP: Skill = {
  name: "joutes-mcp",
  description:
    "Se connecter au serveur MCP de Joutes en streamable-http, avec ou sans identifiant, et découvrir ses outils à l'exécution plutôt que depuis une liste figée.",
  build(origin) {
    const url = (path: string) => new URL(path, origin).toString();

    return [
      frontMatter(this),
      `# Serveur MCP de Joutes`,
      ``,
      `Les données de Joutes — évènements, lieux, jeux, cartes, collections, listes`,
      `de souhaits, groupes de jeu, tournois — exposées en outils MCP.`,
      ``,
      `## Se connecter`,
      ``,
      `- Transport : \`streamable-http\``,
      `- URL : \`${url(MCP_PATH)}\``,
      `- Carte du serveur, lisible sans ouvrir de session : ${url("/.well-known/mcp/server-card.json")}`,
      ``,
      `## Quels outils`,
      ``,
      `Appeler \`tools/list\` après \`initialize\`. Ce catalogue-ci ne les recopie pas :`,
      `une liste figée serait fausse au premier outil ajouté, alors que \`tools/list\``,
      `est à jour par construction.`,
      ``,
      `## S'authentifier, ou pas`,
      ``,
      "```http",
      `Authorization: Bearer <clé API jts_… ou jeton d'accès OAuth>`,
      "```",
      ``,
      `L'en-tête est **facultatif** : les outils de lecture publique répondent sans`,
      `lui. Il ouvre ceux qui touchent à un compte — collection, listes de souhaits,`,
      `tournois. Un outil appelé sans le droit nécessaire répond une erreur, il`,
      `n'échoue pas en silence.`,
      ``,
      `Contrairement à l'API REST, le serveur MCP accepte **les deux** formes`,
      `d'identifiant. Comment les obtenir : ${url(AUTH_MD_PATH)}`,
      ``,
      `## Si rien ne répond`,
      ``,
      `${url(HEALTH_PATH)} dit \`pass\` ou \`fail\` sans authentification. Un \`fail\` n'est`,
      `pas un problème d'identifiant.`,
      ``,
    ].join("\n");
  },
};

const JOUTES_CARD_SEARCH: Skill = {
  name: "joutes-card-search",
  description:
    "Écrire une requête de recherche de cartes pour Joutes : tokens champ:valeur, bornes numériques, et les pièges du vocabulaire, qui dépend du jeu interrogé.",
  build(origin) {
    const url = (path: string) => new URL(path, origin).toString();

    return [
      frontMatter(this),
      `# Recherche de cartes`,
      ``,
      `Le paramètre \`searchQuery\` accepte des tokens en plus du texte libre. Il est`,
      `lu côté serveur, donc utilisable depuis l'API comme depuis l'interface :`,
      ``,
      "```http",
      `GET ${url(REST_API_PATH)}/games/{gameId}/cards?searchQuery=domain%3Afury%20energy%3C%3D3%20deathknell`,
      "```",
      ``,
      `Ici \`domain:fury\` et \`energy<=3\` filtrent ; \`deathknell\` reste le texte cherché.`,
      ``,
      `## Le vocabulaire dépend du jeu`,
      ``,
      `Les champs disponibles sont ceux du jeu interrogé, pas une liste universelle :`,
      `Riftbound expose \`energy\`, \`might\`, \`domain\`, \`rarity\` ; un autre jeu expose les`,
      `siens. Trois champs sont toujours là : \`set\`, \`type\`, \`lang\`.`,
      ``,
      `**Ne pas deviner un nom de champ.** Un mot inconnu n'est pas une erreur : il`,
      `repart simplement au texte libre, et le filtre attendu ne s'applique jamais.`,
      `Un champ reconnu mais mal rempli — \`domain:dragon\` — est signalé dans la`,
      `réponse plutôt qu'appliqué.`,
      ``,
      `## Opérateurs`,
      ``,
      `| Forme | Sur | Effet |`,
      `| --- | --- | --- |`,
      `| \`champ:valeur\` | attribut à valeurs, \`set\`, \`type\`, \`lang\` | égalité, casse indifférente |`,
      `| \`champ=valeur\` | idem | identique à \`:\` |`,
      `| \`champ=3\` | attribut numérique | vaut exactement 3 |`,
      `| \`champ<=3\` / \`champ>=3\` | attribut numérique | borne inclusive |`,
      `| \`champ<3\` / \`champ>3\` | attribut numérique | borne stricte |`,
      ``,
      `Une valeur contenant une espace se met entre guillemets : \`type:"Battlefield Rune"\`.`,
      ``,
      `Deux tokens sur le même attribut se cumulent — \`energy>=2 energy<=5\` donne une`,
      `plage. Deux valeurs d'un même attribut s'entendent comme un « ou ».`,
      ``,
      `## Deux pièges`,
      ``,
      `- **\`:\` ne marche pas sur un attribut numérique.** \`e:3\` repart au texte libre.`,
      `  L'énergie s'écrit \`e=3\`, \`e<=3\`, \`e>=3\`. C'est délibéré : \`e:OGN\` désigne`,
      `  depuis toujours une extension.`,
      `- **Les raccourcis d'une lettre ne sont pas garantis.** Un champ n'en reçoit un`,
      `  que si son initiale ne désigne que lui ; deux champs en \`m\` n'en ont aucun.`,
      `  Dans le doute, écrire le nom entier.`,
      ``,
      `## Pagination`,
      ``,
      `\`page\` et \`limit\` ; \`setCode\`, \`lang\` et \`type\` existent aussi comme paramètres`,
      `d'URL et se cumulent avec les tokens. Détail : ${url(OPENAPI_PATH)}`,
      ``,
    ].join("\n");
  },
};

const SKILLS: readonly Skill[] = [JOUTES_API, JOUTES_MCP, JOUTES_CARD_SEARCH];

/** Les noms publiés, pour que l'index et la route des documents s'accordent. */
export const SKILL_NAMES: readonly string[] = SKILLS.map((skill) => skill.name);

/** Le document d'une compétence, ou `null` si ce nom n'est pas publié. */
export function buildSkillDocument(name: string, origin: string): string | null {
  const skill = SKILLS.find((candidate) => candidate.name === name);
  return skill ? skill.build(origin) : null;
}

export type SkillsIndex = {
  $schema: string;
  skills: Array<{
    name: string;
    type: "skill-md";
    description: string;
    url: string;
    digest: string;
  }>;
};

/**
 * Empreinte des octets réellement servis, au format que le RFC impose.
 *
 * Le document est encodé en UTF-8 comme le fera la réponse : hacher la chaîne
 * JavaScript, dont les caractères accentués comptent pour un, donnerait une
 * empreinte que l'agent ne retrouverait jamais.
 */
function digestOf(document: string): string {
  return `sha256:${createHash("sha256").update(Buffer.from(document, "utf8")).digest("hex")}`;
}

/**
 * L'index, ancré sur l'origine qui le sert — les documents le sont aussi, et
 * leur empreinte avec eux.
 */
export function buildSkillsIndex(origin: string): SkillsIndex {
  return {
    $schema: SKILLS_INDEX_SCHEMA,
    skills: SKILLS.map((skill) => ({
      name: skill.name,
      type: "skill-md" as const,
      description: skill.description,
      url: new URL(`${AGENT_SKILLS_PATH}/${skill.name}/SKILL.md`, origin).toString(),
      digest: digestOf(skill.build(origin)),
    })),
  };
}
