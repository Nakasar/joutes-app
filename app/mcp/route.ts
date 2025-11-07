import { NextRequest, NextResponse } from "next/server";
import {
    ServerNotification,
    ServerRequest,
    TextContent,
    Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { validateApiKeyFromRequest } from "@/lib/middleware/api-auth";
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { getEventsForUser, getAllEvents } from "@/lib/db/events";
import { getAllLairs, getLairById } from "@/lib/db/lairs";
import { getAllGames, getGameById } from "@/lib/db/games";
import { addGameToUser, addLairToUser } from "@/lib/db/users";
import { createEvent } from "@/lib/db/events";
import { Event } from "@/lib/types/Event";
import z from "zod";
import { DateTime } from "luxon";
import { validateApiKey } from "@/lib/db/api-keys";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";


// Définition des outils MCP
const TOOLS: Tool[] = [
    {
        name: "search_events",
        description: "Rechercher des évènements sur la plateforme Joutes. Supporte la personnalisation pour l'utilisateur authentifié et le filtrage par jeux.",
        inputSchema: {
            type: "object",
            properties: {
                personalized: {
                    type: "boolean",
                    description: "Si true, personnalise les résultats pour l'utilisateur authentifié (ses lieux et jeux suivis)"
                },
                gameNames: {
                    type: "array",
                    items: { type: "string" },
                    description: "Liste des noms de jeux pour filtrer les évènements"
                },
                lairName: {
                    type: "string",
                    description: "Nom du lieu pour filtrer les évènements"
                },
                month: {
                    type: "number",
                    description: "Mois pour filtrer (1-12)"
                },
                year: {
                    type: "number",
                    description: "Année pour filtrer"
                },
                maxDistanceKm: {
                    type: "number",
                    description: "Distance maximale en kilomètres (uniquement si personalized=true et utilisateur a une localisation)"
                }
            }
        }
    },
    {
        name: "search_lairs",
        description: "Rechercher des lieux (lairs) sur la plateforme Joutes.",
        inputSchema: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "Nom du lieu à rechercher (optionnel)"
                }
            }
        }
    },
    {
        name: "create_event",
        description: "Créer un nouvel évènement dans un lieu. Nécessite d'être propriétaire du lieu.",
        inputSchema: {
            type: "object",
            properties: {
                lairId: {
                    type: "string",
                    description: "ID du lieu où créer l'évènement"
                },
                name: {
                    type: "string",
                    description: "Nom de l'évènement"
                },
                gameName: {
                    type: "string",
                    description: "Nom du jeu"
                },
                startDateTime: {
                    type: "string",
                    description: "Date et heure de début (format ISO)"
                },
                endDateTime: {
                    type: "string",
                    description: "Date et heure de fin (format ISO)"
                },
                url: {
                    type: "string",
                    description: "URL de l'évènement (optionnel)"
                },
                price: {
                    type: "string",
                    description: "Prix de l'évènement (optionnel)"
                }
            },
            required: ["lairId", "name", "gameName", "startDateTime", "endDateTime"]
        }
    },
    {
        name: "follow_lair",
        description: "Suivre un lieu pour recevoir ses évènements.",
        inputSchema: {
            type: "object",
            properties: {
                lairId: {
                    type: "string",
                    description: "ID du lieu à suivre"
                }
            },
            required: ["lairId"]
        }
    },
    {
        name: "add_game",
        description: "Ajouter un jeu à la liste des jeux suivis par l'utilisateur.",
        inputSchema: {
            type: "object",
            properties: {
                gameId: {
                    type: "string",
                    description: "ID du jeu à ajouter"
                }
            },
            required: ["gameId"]
        }
    },
    {
        name: "list_games",
        description: "Lister tous les jeux disponibles sur la plateforme.",
        inputSchema: {
            type: "object",
            properties: {}
        }
    }
];

// Gestionnaires pour chaque outil
async function handleSearchEvents(argsRaw: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) {
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
            } as TextContent]
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

async function handleSearchLairs(argsRaw: Record<string, unknown>) {
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

async function handleCreateEvent(argsRaw: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) {
    try {
        const userId: string = extra.authInfo?.extra?.userId as string;

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

async function handleFollowLair(argsRaw: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) {
    try {
        const userId: string = extra.authInfo?.extra?.userId as string;

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

async function handleAddGame(argsRaw: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) {
    try {
        const userId: string = extra.authInfo?.extra?.userId as string;

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

async function handleListGames() {
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

async function verifyAuth(
    request: Request,
    bearerToken?: string
): Promise<AuthInfo | undefined> {
    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
        return undefined;
    }

    // Vérifier le format Bearer token
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
        return undefined;
    }

    const apiKey = parts[1];

    if (!apiKey) {
        return undefined;
    }

    // Valider la clé API
    try {
        const validation = await validateApiKey(apiKey);

        if (!validation) {
            return undefined;
        }

        return {
            token: validation.apiKeyId,
            scopes: [],
            clientId: validation.apiKeyId,
            extra: {
                userId: validation.userId,
                apiKeyId: validation.apiKeyId
            }
        };
    } catch (error) {
        console.error("Erreur lors de la validation de la clé API:", error);
        return undefined;
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
}, {}, {
});

const authHandler = withMcpAuth(handler, verifyAuth, {
    required: false,
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
