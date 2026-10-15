import type { ServerContext, TextContent } from "@modelcontextprotocol/server";
import { createMcpHandler, getPublicOrigin } from 'mcp-handler';
import { NextResponse } from "next/server";
import { getEventsForUser, getAllEvents } from "@/lib/db/events";
import { getAllLairs, getLairById } from "@/lib/db/lairs";
import { getAllGames, getGameById } from "@/lib/db/games";
import { addGameToUser, addLairToUser } from "@/lib/db/users";
import { createEvent } from "@/lib/db/events";
import { Event } from "@/lib/types/Event";
import { z } from "zod";
import { DateTime } from "luxon";
import { getErratasByCardId } from "@/lib/db/erratas";
import { getAllPolicies } from "@/lib/db/policies";
import db from "@/lib/mongodb";
import { Game } from "@/lib/types/Game";
import { getRawEntries } from "@/lib/rules/riftbound";
import { serverClient } from "@/lib/server-client";
import { validateApiKey } from "@/lib/db/api-keys";
import { MCP_TOKEN } from "@/lib/well-known/auth-md";
import { MCP_SERVER_INFO } from "@/lib/well-known/mcp-server-card";
import { registerJoutesDataTools, withToolLogging } from "./tools";
import { registerJoutesTool, requiresAccount, userIdFrom } from "./tool-policy";

// Gestionnaires pour chaque outil
async function handleSearchEvents(argsRaw: Record<string, unknown>, ctx: ServerContext): Promise<{ content: TextContent[]; isError?: boolean }> {
    try {
        const userId = userIdFrom(ctx);

        let events: Event[];

        const schema = z.object({
            month: z.number().min(1).max(12).optional(),
            year: z.number().min(2020).optional(),
            gameNames: z.array(z.string()).optional(),
            personalized: z.boolean().optional(),
            userLocation: z.object({
                latitude: z.number().min(-90).max(90),
                longitude: z.number().min(-180).max(180)
            }).optional(),
            maxDistanceKm: z.number().min(0).optional()
        });

        const validation = schema.safeParse(argsRaw);
        if (!validation.success) {
            return {
                content: [{
                    type: "text",
                    text: "Arguments invalides."
                } as TextContent],
                isError: true
            };
        }
        const args = validation.data;

        if (args.personalized && userId) {
            // Recherche personnalisée pour l'utilisateur
            const userLocation = args.userLocation ? {
                latitude: args.userLocation.latitude,
                longitude: args.userLocation.longitude
            } : undefined;

            events = await getEventsForUser(
                userId,
                "all", // tous les jeux
                args.month,
                args.year,
                userLocation,
                args.maxDistanceKm
            );
        } else {
            // Recherche générale
            const query: { year?: number; month?: number; games?: string[] } = {};
            const now = DateTime.now();

            query.year = args.year || now.year;
            query.month = args.month || now.month;

            if (args.gameNames) {
                query.games = args.gameNames;
            }

            events = await getAllEvents(query);
        }

        const eventsText = events.map(event =>
            `**${event.name}**
- Jeu: ${event.gameName}
- Lieu: ${event.lair?.name || 'Non spécifié'}
- Date: ${new Date(event.startDateTime).toLocaleString('fr-FR')}
- Prix: ${event.price || 'Gratuit'}
${event.url ? `- URL: ${event.url}` : ''}`
        ).join('\n\n');

        return {
            content: [{
                type: "text",
                text: `Trouvé ${events.length} évènement(s):\n\n${eventsText || 'Aucun évènement trouvé.'}`
            }]
        };
    } catch (error) {
        console.error("Erreur lors de la recherche d'évènements:", error);
        return {
            content: [{
                type: "text",
                text: "Erreur lors de la recherche d'évènements."
            } as TextContent],
            isError: true
        };
    }
}

async function handleSearchLairs(argsRaw: Record<string, unknown>): Promise<{ content: TextContent[]; isError?: boolean }> {
    try {
        const schema = z.object({
            name: z.string().optional()
        });

        const validation = schema.safeParse(argsRaw);
        if (!validation.success) {
            return {
                content: [{
                    type: "text",
                    text: "Arguments invalides pour la recherche de lieux."
                }],
                isError: true
            };
        }
        const args = validation.data;

        const lairs = await getAllLairs();

        let filteredLairs = lairs;
        if (args.name) {
            filteredLairs = lairs.filter(lair =>
                lair.name.toLowerCase().includes(args.name!.toLowerCase())
            );
        }

        const lairsText = filteredLairs.map(lair =>
            `**${lair.name}** (ID: ${lair.id})
- Adresse: ${lair.address || 'Non spécifiée'}
- Site web: ${lair.website || 'Non spécifié'}
- Jeux: ${lair.games?.join(', ') || 'Aucun'}`
        ).join('\n\n');

        return {
            content: [{
                type: "text",
                text: `Trouvé ${filteredLairs.length} lieu(x):\n\n${lairsText || 'Aucun lieu trouvé.'}`
            }]
        };
    } catch (error) {
        console.error("Erreur lors de la recherche de lieux:", error);
        return {
            content: [{
                type: "text",
                text: "Erreur lors de la recherche de lieux."
            }],
            isError: true
        };
    }
}

async function handleCreateEvent(argsRaw: Record<string, unknown>, ctx: ServerContext): Promise<{ content: TextContent[]; isError?: boolean }> {
    try {
        const userId = userIdFrom(ctx);

        if (!userId) {
            return {
                content: [{
                    type: "text",
                    text: "Authentification requise pour créer un évènement."
                }],
                isError: true
            };
        }

        const schema = z.object({
            lairId: z.string(),
            name: z.string(),
            gameName: z.string(),
            startDateTime: z.string(),
            endDateTime: z.string(),
            url: z.string().optional(),
            price: z.string().transform((val) => parseFloat(val)).optional()
        });

        const validation = schema.safeParse(argsRaw);
        if (!validation.success) {
            return {
                content: [{
                    type: "text",
                    text: "Arguments invalides pour la création d'évènement."
                }],
                isError: true
            };
        }
        const args = validation.data;

        // Vérifier que l'utilisateur est propriétaire du lieu
        const lair = await getLairById(args.lairId);
        if (!lair) {
            return {
                content: [{
                    type: "text",
                    text: "Lieu non trouvé."
                }],
                isError: true
            };
        }

        if (!lair.owners?.includes(userId)) {
            return {
                content: [{
                    type: "text",
                    text: "Vous n'êtes pas autorisé à créer des évènements dans ce lieu."
                }],
                isError: true
            };
        }

        // Créer l'évènement
        const event: Event = {
            id: "", // Sera généré
            lairId: args.lairId,
            name: args.name,
            gameName: args.gameName,
            startDateTime: args.startDateTime,
            endDateTime: args.endDateTime,
            url: args.url,
            price: args.price,
            status: "available",
            addedBy: userId
        };

        const createdEvent = await createEvent(event);

        return {
            content: [{
                type: "text",
                text: `Évènement créé avec succès: **${createdEvent.name}** dans ${lair.name}`
            }]
        };
    } catch (error) {
        console.error("Erreur lors de la création de l'évènement:", error);
        return {
            content: [{
                type: "text",
                text: "Erreur lors de la création de l'évènement."
            }],
            isError: true
        };
    }
}

async function handleFollowLair(argsRaw: Record<string, unknown>, ctx: ServerContext): Promise<{ content: TextContent[]; isError?: boolean }> {
    try {
        const userId = userIdFrom(ctx);

        if (!userId) {
            return {
                content: [{
                    type: "text",
                    text: "Authentification requise pour suivre un lieu."
                }],
                isError: true
            };
        }

        const schema = z.object({
            lairId: z.string()
        });

        const validation = schema.safeParse(argsRaw);
        if (!validation.success) {
            return {
                content: [{
                    type: "text",
                    text: "Arguments invalides pour suivre un lieu."
                }],
                isError: true
            };
        }
        const args = validation.data;

        const lair = await getLairById(args.lairId);
        if (!lair) {
            return {
                content: [{
                    type: "text",
                    text: "Lieu non trouvé."
                }],
                isError: true
            };
        }

        const success = await addLairToUser(userId, args.lairId);

        if (success) {
            return {
                content: [{
                    type: "text",
                    text: `Vous suivez maintenant le lieu **${lair.name}**.`
                }]
            };
        } else {
            return {
                content: [{
                    type: "text",
                    text: "Erreur lors du suivi du lieu."
                }],
                isError: true
            };
        }
    } catch (error) {
        console.error("Erreur lors du suivi du lieu:", error);
        return {
            content: [{
                type: "text",
                text: "Erreur lors du suivi du lieu."
            }],
            isError: true
        };
    }
}

async function handleAddGame(argsRaw: Record<string, unknown>, ctx: ServerContext): Promise<{ content: TextContent[]; isError?: boolean }> {
    try {
        const userId = userIdFrom(ctx);

        if (!userId) {
            return {
                content: [{
                    type: "text",
                    text: "Authentification requise pour suivre un jeu"
                }],
                isError: true
            };
        }

        const schema = z.object({
            gameId: z.string()
        });

        const validation = schema.safeParse(argsRaw);
        if (!validation.success) {
            return {
                content: [{
                    type: "text",
                    text: "Arguments invalides pour ajouter un jeu."
                }],
                isError: true
            };
        }
        const args = validation.data;

        const game = await getGameById(args.gameId);
        if (!game) {
            return {
                content: [{
                    type: "text",
                    text: "Jeu non trouvé."
                }],
                isError: true
            };
        }

        const success = await addGameToUser(userId, args.gameId);

        if (success) {
            return {
                content: [{
                    type: "text",
                    text: `Le jeu **${game.name}** a été ajouté à votre liste.`
                }]
            };
        } else {
            return {
                content: [{
                    type: "text",
                    text: "Erreur lors de l'ajout du jeu."
                }],
                isError: true
            };
        }
    } catch (error) {
        console.error("Erreur lors de l'ajout du jeu:", error);
        return {
            content: [{
                type: "text",
                text: "Erreur lors de l'ajout du jeu."
            }],
            isError: true
        };
    }
}

async function handleListGames(): Promise<{ content: TextContent[]; isError?: boolean }> {
    try {
        const games = await getAllGames();

        const gamesText = games.map(game =>
            `**${game.name}** (ID: ${game.id})
- Type: ${game.type || 'Non spécifié'}
- Description: ${game.description || 'Aucune description'}`
        ).join('\n\n');

        return {
            content: [{
                type: "text",
                text: `${games.length} jeu(x) disponible(s):\n\n${gamesText}`
            }]
        };
    } catch (error) {
        console.error("Erreur lors de la récupération des jeux:", error);
        return {
            content: [{
                type: "text",
                text: "Erreur lors de la récupération des jeux."
            }],
            isError: true
        };
    }
}

// handlers Joutes Tools
async function handleSearchCard(params: {
    gameName?: string;
    cardName: string;
}): Promise<{ content: TextContent[]; isError?: boolean }> {
    let game;
    if (params.gameName) {
        game = await db.collection("games").findOne({ $or: [{ name: params.gameName }, { slug: params.gameName }] });

        if (!game) {
            return {
                content: [
                    {
                        type: "text",
                        text: `No game found with name "${params.gameName ?? "N/A"}".`
                    }
                ],
                isError: false,
            };
        }
    }

    const card = await db.collection("cards").findOne({ name: params.cardName, gameId: game?._id });

    if (!card) {
        return {
            content: [
                {
                    type: "text",
                    text: `No card found with name "${params.cardName}" in game "${params.gameName ?? "N/A"}".`
                }
            ],
            isError: false,
        };
    }

    const erratas = await getErratasByCardId(card.id);

    return {
        content: [
            {
                type: "text",
                text: `You searched for card "${params.cardName}" in game "${params.gameName ?? "N/A"}".${card.image ? `\n\n![${card.name}](${card.image})` : ""}${card.text ? `\n\nText of the card:\n${card.text}` : ""}\n\nThis card has ${erratas.length} erratas.\n\nErratas details:\n${erratas.map((e, index) => `\n${index + 1}. Type: ${e.type}, Details: ${e.details}, Source: ${e.source}, Errata ID: ${e.id}`).join("\n")}`
            }
        ],
        isError: false,
    };
}

async function handleVoteErrata(params: {
    errataId: string;
    vote: "upvote" | "downvote";
}): Promise<{ content: TextContent[]; isError?: boolean }> {
    return {
        content: [
            {
                type: "text",
                text: `You voted "${params.vote}" on errata with ID "${params.errataId}".`
            }
        ],
        isError: false,
    };
}

async function handleSearchRules(params: {
    gameName: string;
    query: string;
}): Promise<{ content: TextContent[]; isError?: boolean }> {
    const game = await db.collection<Game>("games").findOne({ $or: [{ name: params.gameName }, { slug: params.gameName }] });

    if (!game) {
        return {
            content: [
                {
                    type: "text",
                    text: `No game found with name "${params.gameName ?? "N/A"}".`
                }
            ],
            isError: false,
        };
    }

    const results = await getAllPolicies({
        gameId: game._id.toString(),
        offset: 0,
        limit: 3,
        search: params.query,
    });

    const rules: { id: string; content: string }[] = [];
    if (game.slug === 'riftbound') {
        const cr = getRawEntries('CR', 'en');
        const tr = getRawEntries('TR', 'en');

        // search for matching rules in CR
        const crRule = cr.find(r => r.content.toLowerCase() === params.query.toLowerCase());
        if (crRule) {
            // get sub items for this rule
            const crSubRules = cr.filter(r => r.id.startsWith(crRule.id + "."));
            rules.push({ id: `CR${crRule.id}`, content: crRule.content });
            rules.push(...crSubRules.map(r => ({ id: `CR${r.id}`, content: r.content })));

        }
        // search for matching rules in TR
        const trRule = tr.find(r => r.content.toLowerCase() === params.query.toLowerCase());
        if (trRule) {
            // get sub items for this rule
            const trSubRules = tr.filter(r => r.id.startsWith(trRule.id + "."));
            rules.push({ id: `TR${trRule.id}`, content: trRule.content });
            rules.push(...trSubRules.map(r => ({ id: `TR${r.id}`, content: r.content })));
        }
    }

    return {
        content: [
            {
                type: "text",
                text: `You searched for rules in game "${params.gameName ?? "N/A"}" with query "${params.query}".\n\n${rules.length > 0 ? `Found some exact rules:\n${rules.map(r => `- ${r.id}: ${r.content}`).join('\n')}` : ''}\n\nAlso found ${results.length} policies.\nPolicies details:\n${results.map((p, index) => `\n${index + 1}. Title: ${p.title}, Content: ${p.content}, Source: ${p.source}, Policy ID: ${p.id}`).join("\n")}`
            },
        ],
        isError: false,
    };
}

async function handleGetRule(params: {
    gameName: string;
    id: string;
}): Promise<{ content: TextContent[]; isError?: boolean }> {
    const game = await db.collection("games").findOne({ $or: [{ name: params.gameName }, { slug: params.gameName }] });

    if (!game) {
        return {
            content: [
                {
                    type: "text",
                    text: `No game found with name "${params.gameName ?? "N/A"}".`
                }
            ],
            isError: false,
        };
    }

    let rule: string | undefined;
    if (params.id.startsWith("TR")) {
        rule = getRawEntries('TR', 'en').find(r => r.id === params.id.replace("TR", ""))?.content;
    } else {
        rule = getRawEntries('CR', 'en').find(r => r.id === params.id.replace("CR", ""))?.content;
    }

    if (!rule) {
        return {
            content: [
                {
                    type: "text",
                    text: `No rule found with ID "${params.id}" in game "${params.gameName ?? "N/A"}".`
                }
            ],
            isError: false,
        };
    }

    return {
        content: [
            {
                type: "text",
                text: `You searched for rule with ID "${params.id}" in game "${params.gameName ?? "N/A"}".\n\nRule details:\n${rule}`,
            },
        ],
        isError: false,
    };
}

// Marge sous `maxDuration` (60s, exporté plus bas) pour que le garde-fou
// réponde avant que la plateforme ne coupe la fonction.
const HANDLER_TIMEOUT_MS = 55_000;

// Route principale MCP
//
// Ce que chaque outil exige (compte ou non) et ce qu'il touche (lecture,
// écriture, suppression) est déclaré dans `TOOL_POLICIES` (./tool-policy.ts),
// pas ici : `registerJoutesTool` en tire les annotations du protocole.
const handler = createMcpHandler(server => {
    registerJoutesTool(server, "search_events", {
        title: "Search events",
        description: "Rechercher des évènements sur la plateforme Joutes. Supporte la personnalisation pour l'utilisateur authentifié et le filtrage par jeux.",
        inputSchema: {
            month: z.number().min(1).max(12).optional(),
            year: z.number().min(2020).optional(),
            gameNames: z.array(z.string()).optional(),
            personalized: z.boolean().optional(),
            userLocation: z.object({
                latitude: z.number().min(-90).max(90),
                longitude: z.number().min(-180).max(180)
            }).optional(),
            maxDistanceKm: z.number().min(0).optional()
        },
    }, withToolLogging("search_events", handleSearchEvents));
    registerJoutesTool(server, "search_lairs", {
        title: "Search lairs",
        description: "Rechercher des lieux (lairs) sur la plateforme Joutes.",
        inputSchema: {
            name: z.string().optional()
        },
    }, withToolLogging("search_lairs", handleSearchLairs));
    registerJoutesTool(server, "create_event", {
        title: "Create event",
        description: "Créer un nouvel évènement dans un lieu. Nécessite d'être propriétaire du lieu.",
        inputSchema: {
            lairId: z.string(),
            name: z.string(),
            gameName: z.string(),
            startDateTime: z.string(),
            endDateTime: z.string(),
            url: z.string().optional(),
            price: z.string().optional()
        },
    }, withToolLogging("create_event", handleCreateEvent));
    registerJoutesTool(server, "follow_lair", {
        title: "Follow lair",
        description: "Suivre un lieu pour recevoir ses évènements.",
        inputSchema: {
            lairId: z.string()
        },
    }, withToolLogging("follow_lair", handleFollowLair));
    registerJoutesTool(server, "add_game", {
        title: "Follow game",
        description: "Ajouter un jeu à la liste des jeux suivis par l'utilisateur.",
        inputSchema: {
            gameId: z.string()
        },
    }, withToolLogging("add_game", handleAddGame));
    registerJoutesTool(server, "list_games", {
        title: "List games",
        description: "Lister tous les jeux disponibles sur la plateforme.",
        inputSchema: {},
    }, withToolLogging("list_games", handleListGames));
    registerJoutesTool(server, "search_card", {
        title: "Search cards",
        description: "Search for cards and their details, erratas and rulings.",
        inputSchema: {
            gameName: z.string().optional(),
            cardName: z.string(),
        },
    }, withToolLogging("search_card", handleSearchCard));
    registerJoutesTool(server, "search_rules", {
        title: "Search rules and policies",
        description: "Search for rules, policies, tournament regulation, keywords...",
        inputSchema: {
            gameName: z.string(),
            query: z.string(),
        },
    }, withToolLogging("search_rules", handleSearchRules));
    registerJoutesTool(server, "vote_errata", {
        title: "Vote on errata",
        description: "Vote on the correctness of card erratas or rulings.",
        inputSchema: {
            errataId: z.string(),
            vote: z.enum(["upvote", "downvote"]),
        },
    }, withToolLogging("vote_errata", handleVoteErrata));
    registerJoutesTool(server, "get_rule", {
        title: "Get rule by ID",
        description: "Get the content of a tournament rule (TR) or core rule (CR) by its ID.",
        inputSchema: {
            gameName: z.string().describe("Name of the game"),
            id: z.string().describe("ID of the rule. Prefix by type. Example: TR509.4.c.1"),
        },
    }, withToolLogging("get_rule", handleGetRule));
    registerJoutesDataTools(server);
}, {
    // Partagé avec la carte du serveur : ce que dit la poignée de main et ce
    // que dit `/.well-known/mcp/server-card.json` ne peuvent pas diverger.
    serverInfo: MCP_SERVER_INFO,
    verboseLogs: true,
});

// Durée max de la fonction serverless. Sans cet export, Vercel applique sa
// limite de plateforme (300s) : une requête bloquée y restait jusqu'au 504.
export const maxDuration = 60;

// Garde-fou hérité de mcp-handler 1.x, qui avalait le rejet d'un
// enregistrement d'outils raté et laissait la requête pendante jusqu'au
// timeout de la plateforme. La 2.x passe directement par le transport du SDK,
// mais une requête bloquée (base injoignable…) doit toujours finir en erreur
// explicite plutôt qu'en 504. Aucune route ici n'est longue durée : GET et
// DELETE répondent 405 et POST est une requête/réponse JSON-RPC unitaire.
function withTimeout(promise: Promise<Response>): Promise<Response> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`[MCP] Aucune réponse après ${HANDLER_TIMEOUT_MS}ms.`));
        }, HANDLER_TIMEOUT_MS);

        promise.then(resolve, reject).finally(() => clearTimeout(timer));
    });
}

/**
 * Les outils appelés par cette requête POST, lus sans consommer le corps.
 * Couvre les lots JSON-RPC, que les clients 2025-03-26 envoient encore.
 */
async function calledToolNames(req: Request): Promise<string[]> {
    if (req.method !== "POST") return [];
    try {
        const body: unknown = await req.clone().json();
        const messages = Array.isArray(body) ? body : [body];
        return messages.flatMap(message => {
            const m = message as { method?: unknown; params?: { name?: unknown } } | null;
            return m?.method === "tools/call" && typeof m.params?.name === "string" ? [m.params.name] : [];
        });
    } catch {
        return [];
    }
}

/**
 * 401 pour un appel anonyme à un outil qui exige un compte.
 *
 * Le serveur accepte les connexions sans jeton, pour les outils publics. Un
 * client qui s'y est connecté ainsi doit pourtant apprendre, au moment où il
 * appelle un outil réservé, qu'il lui faut un jeton et où le demander : c'est
 * ce que dit l'en-tête `WWW-Authenticate` (RFC 9728), et ce que les clients
 * MCP suivent pour lancer la connexion. Un résultat d'outil en erreur, lui,
 * n'est lu que par le modèle, qui ne peut pas connecter l'utilisateur.
 */
function authenticationChallenge(req: Request, invalidToken: boolean): Response {
    const resourceMetadata = new URL("/.well-known/oauth-protected-resource", getPublicOrigin(req)).toString();
    const params = [`resource_metadata="${resourceMetadata}"`];
    if (invalidToken) {
        params.push(`error="invalid_token"`, `error_description="Jeton invalide ou expiré"`);
    }
    return NextResponse.json(
        { error: "unauthorized", error_description: "Cet outil nécessite un compte Joutes connecté." },
        { status: 401, headers: { "WWW-Authenticate": `Bearer ${params.join(", ")}` } }
    );
}

async function authHandler(req: Request) {
    const authorization = req.headers?.get("authorization") ?? undefined;
    const accessToken = authorization?.startsWith("Bearer ")
        ? authorization.replace("Bearer ", "")
        : authorization;

    try {
        if (accessToken) {
            if (accessToken.startsWith("jts_")) {
                const key = await validateApiKey(accessToken);
                if (key) {
                    req.auth = {
                        clientId: `api_key_${key.apiKeyId}`,
                        scopes: ["*"], // scopes can be implemented if needed
                        token: accessToken,
                        extra: {
                            userId: key.userId,
                        },
                    };
                }
            } else {
                // Rien de ce qui suit ne journalise le jeton : un porteur écrit
                // en clair dans les journaux vaut le compte qu'il ouvre, et il
                // survit à la session dans les exports et la rétention.
                const payload = await serverClient.verifyAccessToken(
                    accessToken, {
                    jwksUrl: MCP_TOKEN.jwksUri,
                    verifyOptions: {
                        audience: MCP_TOKEN.audience,
                        issuer: MCP_TOKEN.issuer,
                    },
                });

                req.auth = {
                    clientId: payload.aud as string,
                    scopes: payload.scope ? (payload.scope as string).split(" ") : [],
                    token: accessToken ?? "",
                    extra: {
                        userId: payload.sub,
                    },
                }
            }
        }
    } catch (err) {
        console.debug("Authentication error:", err);
    }

    console.log(`[MCP] Requête ${req.method} reçue`);

    if (!req.auth) {
        const toolNames = await calledToolNames(req);
        if (toolNames.some(requiresAccount)) {
            return authenticationChallenge(req, Boolean(accessToken));
        }
    }

    try {
        return await withTimeout(handler(req));
    } catch (error) {
        console.error("[MCP] Erreur non gérée lors du traitement de la requête:", error);
        return NextResponse.json(
            { error: "Erreur interne lors du traitement de la requête MCP." },
            { status: 500 }
        );
    }
}

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
