import {
    ServerNotification,
    ServerRequest,
    TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { createMcpHandler } from 'mcp-handler';
import { getEventsForUser, getAllEvents } from "@/lib/db/events";
import { getAllLairs, getLairById } from "@/lib/db/lairs";
import { getAllGames, getGameById } from "@/lib/db/games";
import { addGameToUser, addLairToUser } from "@/lib/db/users";
import { createEvent } from "@/lib/db/events";
import { Event } from "@/lib/types/Event";
import { z } from "zod/v3";
import { DateTime } from "luxon";
import { mcpHandler } from "@better-auth/oauth-provider";
import { getErratasByCardId } from "@/lib/db/erratas";
import { getAllPolicies } from "@/lib/db/policies";
import db from "@/lib/mongodb";
import { Game } from "@/lib/types/Game";
import { getRawEntries } from "@/lib/rules/riftbound";
import { serverClient } from "@/lib/server-client";
import { validateApiKey } from "@/lib/db/api-keys";

// Gestionnaires pour chaque outil
async function handleSearchEvents(argsRaw: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>): Promise<{ content: TextContent[]; isError?: boolean }> {
    try {
        const userId: string = extra.authInfo?.extra?.userId as string;

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

async function handleCreateEvent(argsRaw: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>): Promise<{ content: TextContent[]; isError?: boolean }> {
    try {
        const userId: string = extra.authInfo?.extra?.userId as string;

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

async function handleFollowLair(argsRaw: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>): Promise<{ content: TextContent[]; isError?: boolean }> {
    try {
        console.info(extra.authInfo);
        const userId: string = extra.authInfo?.extra?.userId as string;

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

async function handleAddGame(argsRaw: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>): Promise<{ content: TextContent[]; isError?: boolean }> {
    try {
        const userId: string = extra.authInfo?.extra?.userId as string;

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

// Route principale MCP
const handler = createMcpHandler(server => {
    server.tool("search_events", "Rechercher des évènements sur la plateforme Joutes. Supporte la personnalisation pour l'utilisateur authentifié et le filtrage par jeux.", {
        month: z.number().min(1).max(12).optional(),
        year: z.number().min(2020).optional(),
        gameNames: z.array(z.string()).optional(),
        personalized: z.boolean().optional(),
        userLocation: z.object({
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180)
        }).optional(),
        maxDistanceKm: z.number().min(0).optional()
    }, handleSearchEvents);
    server.tool("search_lairs", "Rechercher des lieux (lairs) sur la plateforme Joutes.", {
        name: z.string().optional()
    }, handleSearchLairs);
    server.tool("create_event", "Créer un nouvel évènement dans un lieu. Nécessite d'être propriétaire du lieu.", {
        lairId: z.string(),
        name: z.string(),
        gameName: z.string(),
        startDateTime: z.string(),
        endDateTime: z.string(),
        url: z.string().optional(),
        price: z.string().transform((val) => parseFloat(val)).optional()
    }, handleCreateEvent);
    server.tool("follow_lair", "Suivre un lieu pour recevoir ses évènements.", {
        lairId: z.string()
    }, handleFollowLair);
    server.tool("add_game", "Ajouter un jeu à la liste des jeux suivis par l'utilisateur.", {
        gameId: z.string()
    }, handleAddGame);
    server.tool("list_games", "Lister tous les jeux disponibles sur la plateforme.", {}, handleListGames);
    server.registerTool("search_card", {
        title: "Search cards",
        description: "Search for cards and their details, erratas and rulings.",
        inputSchema: {
            gameName: z.string().optional(),
            cardName: z.string(),
        },
    }, handleSearchCard);
    server.registerTool("search_rules", {
        title: "Search rules and policies",
        description: "Search for rules, policies, tournament regulation, keywords...",
        inputSchema: {
            gameName: z.string(),
            query: z.string(),
        },
    }, handleSearchRules);
    server.registerTool("vote_errata", {
        title: "Vote on errata",
        description: "Vote on the correctness of card erratas or rulings.",
        inputSchema: {
            errataId: z.string(),
            vote: z.enum(["upvote", "downvote"]),
        },
    }, handleVoteErrata);
    server.registerTool("get_rule", {
        title: "Get rule by ID",
        description: "Get the content of a tournament rule (TR) or core rule (CR) by its ID.",
        inputSchema: {
            gameName: z.string().describe("Name of the game"),
            id: z.string().describe("ID of the rule. Prefix by type. Example: TR509.4.c.1"),
        },
    }, handleGetRule);
}, {
    serverInfo: {
        name: "Joutes APP",
        version: "1.0.0",
    }
}, {
    basePath: '',
    verboseLogs: true,
    maxDuration: 60,
});

async function authHandler(req: Request) {
    try {
        const authorization = req.headers?.get("authorization") ?? undefined;
        const accessToken = authorization?.startsWith("Bearer ")
            ? authorization.replace("Bearer ", "")
            : authorization;

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
                console.log(accessToken);
                const payload = await serverClient.verifyAccessToken(
                    accessToken, {
                    jwksUrl: "https://www.joutes.app/api/auth/jwks",
                    verifyOptions: {
                        audience: "https://www.joutes.app/",
                        issuer: "https://www.joutes.app/api/auth",
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

    return handler(req);
}

/*
const authHandler = mcpHandler({
    jwksUrl: "https://www.joutes.app/api/auth/jwks",
    verifyOptions: {
        audience: "https://www.joutes.app/",
        issuer: "https://www.joutes.app/api/auth",
    },
}, (req, jwt) => {
    req.auth = req.auth ? {
        ...req.auth,
        clientId: '',
        scopes: [],
        extra: {
            ...req.auth.extra,
            userId: jwt.sub,
        },
    } : {
        token: '',
        clientId: '',
        scopes: [],
        extra: {
            userId: jwt.sub,
        },
    };
    return handler(req);
}, {
    resourceMetadataMappings: {},
});
*/

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
