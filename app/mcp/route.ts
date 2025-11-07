import { NextRequest, NextResponse } from "next/server";
import { validateApiKeyFromRequest } from "@/lib/middleware/api-auth";
import { getEventsForUser, getAllEvents } from "@/lib/db/events";
import { getAllLairs, getLairById, addOwnerToLair } from "@/lib/db/lairs";
import { getAllGames, getGameById } from "@/lib/db/games";
import { addGameToUser, addLairToUser, getUserById } from "@/lib/db/users";
import { createEvent } from "@/lib/db/events";
import { Event } from "@/lib/types/Event";
import z from "zod";
import { DateTime } from "luxon";

// Types pour le protocole MCP
type MCPRequest = {
    method: string;
    params?: {
        name?: string;
        arguments?: Record<string, unknown>;
    };
};

type MCPResponse = {
    content?: Array<{
        type: string;
        text: string;
    }>;
    isError?: boolean;
};

type MCPTool = {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: Record<string, unknown>;
        required?: string[];
    };
};

// Définition des outils MCP disponibles
const MCP_TOOLS: MCPTool[] = [
    {
        name: "search_events",
        description: "Rechercher des évènements sur la plateforme Joutes. Supporte la personalisation pour l'utilisateur authentifié et le filtrage par jeux.",
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

// Gestionnaires pour chaque outil MCP
async function handleSearchEvents(argsRaw: Record<string, unknown>, userId?: string): Promise<MCPResponse> {
    try {
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
                }],
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
                args.month ,
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
            }],
            isError: true
        };
    }
}

async function handleSearchLairs(argsRaw: Record<string, unknown>): Promise<MCPResponse> {
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

async function handleCreateEvent(argsRaw: Record<string, unknown>, userId: string): Promise<MCPResponse> {
    try {
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

async function handleFollowLair(argsRaw: Record<string, unknown>, userId: string): Promise<MCPResponse> {
    try {
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

async function handleAddGame(argsRaw: Record<string, unknown>, userId: string): Promise<MCPResponse> {
    try {
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

async function handleListGames(): Promise<MCPResponse> {
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
export async function POST(request: NextRequest) {
    try {
        const body: MCPRequest = await request.json();

        // Gestion des méthodes MCP standard
        if (body.method === "tools/list") {
            return NextResponse.json({
                tools: MCP_TOOLS
            });
        }

        if (body.method === "tools/call") {
            const toolName = body.params?.name;
            const args = body.params?.arguments || {};

            if (!toolName) {
                return NextResponse.json({
                    content: [{
                        type: "text",
                        text: "Nom de l'outil manquant."
                    }],
                    isError: true
                });
            }

            // Vérifier l'authentification pour les outils qui en ont besoin
            const authRequiredTools = ["create_event", "follow_lair", "add_game"];
            const personalizedTools = ["search_events"];

            let userId: string | undefined;

            if (authRequiredTools.includes(toolName) ||
                (personalizedTools.includes(toolName) && args.personalized)) {
                const auth = await validateApiKeyFromRequest(request);

                if ("error" in auth) {
                    return NextResponse.json({
                        content: [{
                            type: "text",
                            text: auth.error
                        }],
                        isError: true
                    }, { status: auth.status });
                }

                userId = auth.userId;

                // Vérifier que l'utilisateur existe encore
                const user = await getUserById(userId);
                if (!user) {
                    return NextResponse.json({
                        content: [{
                            type: "text",
                            text: "Utilisateur non trouvé."
                        }],
                        isError: true
                    }, { status: 401 });
                }
            }

            // Router vers le bon gestionnaire
            let response: MCPResponse;

            switch (toolName) {
                case "search_events":
                    response = await handleSearchEvents(args, userId);
                    break;
                case "search_lairs":
                    response = await handleSearchLairs(args);
                    break;
                case "create_event":
                    response = await handleCreateEvent(args, userId!);
                    break;
                case "follow_lair":
                    response = await handleFollowLair(args, userId!);
                    break;
                case "add_game":
                    response = await handleAddGame(args, userId!);
                    break;
                case "list_games":
                    response = await handleListGames();
                    break;
                default:
                    response = {
                        content: [{
                            type: "text",
                            text: `Outil inconnu: ${toolName}`
                        }],
                        isError: true
                    };
            }

            return NextResponse.json(response);
        }

        // Méthode non supportée
        return NextResponse.json({
            content: [{
                type: "text",
                text: `Méthode non supportée: ${body.method}`
            }],
            isError: true
        }, { status: 400 });

    } catch (error) {
        console.error("Erreur serveur MCP:", error);
        return NextResponse.json({
            content: [{
                type: "text",
                text: "Erreur interne du serveur MCP"
            }],
            isError: true
        }, { status: 500 });
    }
}

// Supporter également GET pour des informations basiques
export async function GET() {
    return NextResponse.json({
        name: "Joutes MCP Server",
        version: "1.0.0",
        description: "Serveur MCP pour accéder aux fonctionnalités de la plateforme Joutes",
        tools: MCP_TOOLS.map(tool => ({
            name: tool.name,
            description: tool.description
        }))
    });
}