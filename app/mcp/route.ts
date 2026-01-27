import {
    ServerNotification,
    ServerRequest,
    TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { createMcpHandler } from 'mcp-handler';
import { getEventsForUser, getAllEvents } from "@/lib/db/events";
import { getAllLairs, getLairById } from "@/lib/db/lairs";
import { getAllGames, getGameById } from "@/lib/db/games";
import { addGameToUser, addLairToUser } from "@/lib/db/users";
import { createEvent } from "@/lib/db/events";
import { Event } from "@/lib/types/Event";
import { z } from "zod/v3";
import { DateTime } from "luxon";
import { RequestHandlerExtra} from "@modelcontextprotocol/sdk/shared/protocol.js";
import { mcpHandler } from "@better-auth/oauth-provider";

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
                true, // allGames pour l'instant
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

const authHandler = mcpHandler({
    jwksUrl: "https://www.joutes.app/api/auth/jwks",
    verifyOptions: {
        audience: "https://www.joutes.app/",
        issuer: "https://www.joutes.app/api/auth",
    },
}, handler, {
    resourceMetadataMappings: {},
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
