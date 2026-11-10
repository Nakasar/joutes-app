import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";

import { locales, type Locale } from "@/i18n/config";
import { createNews, getAllTags, getNews, getNewsById, updateNews } from "@/lib/db/news";
import { anyUserHasPermission } from "@/lib/db/permissions";
import { newsOriginalLang, newsPath } from "@/lib/news/localize";
import { createNewsSchema, updateNewsSchema } from "@/lib/schemas/news.schema";
import type { News } from "@/lib/types/News";
import { describeNews, describeNewsLine, newsLang } from "@/lib/mcp/news";
import { linkLine, mcpLinks } from "@/lib/mcp/links";
import { registerJoutesTool, userIdFrom, type ToolResult } from "./tool-policy";
import { errorResult, resolveGame, textResult, withToolLogging } from "./tools";

/*
 * Les outils des actualités : lire le fil (public), et, pour qui a la
 * permission de les rédiger (`news:update`), en publier ou en corriger une.
 * Les traductions restent à l'écran de traduction du site.
 */

const NEWS_PERMISSION = "news:update";

/** L'adresse d'une actualité dans la langue servie. */
function newsLink(news: News, lang?: Locale): string {
    return mcpLinks.news(newsPath(news.id, newsLang(news, lang), newsOriginalLang(news)));
}

/** Les jeux nommés, en identifiants ; une erreur qui nomme ceux qu'on ne connaît pas. */
async function resolveGameIds(gameNames: string[]): Promise<{ ids: string[] } | { error: ToolResult }> {
    const games = await Promise.all(gameNames.map((name) => resolveGame(name)));
    const unknown = gameNames.filter((_, index) => !games[index]);
    if (unknown.length > 0) return { error: errorResult(`Jeu introuvable : ${unknown.join(", ")}.`) };
    return { ids: [...new Set(games.map((game) => game!._id.toString()))] };
}

function invalid(issues: { path: PropertyKey[]; message: string }[]): ToolResult {
    return errorResult(`Données invalides : ${issues.map((issue) => `${issue.path.join(".") || "actualité"} — ${issue.message}`).join(" ; ")}`);
}

async function handleListNews(args: { gameName?: string; tag?: string; lang?: Locale; page: number; limit: number }): Promise<ToolResult> {
    let gameId: string | undefined;
    let gameName: string | undefined;
    if (args.gameName) {
        const game = await resolveGame(args.gameName);
        if (!game) return errorResult(`Jeu « ${args.gameName} » introuvable.`);
        gameId = game._id.toString();
        gameName = game.name;
    }
    const tag = args.tag?.trim().replace(/^#/, "") || undefined;
    const result = await getNews({ gameId, tag, page: args.page, limit: args.limit });

    if (result.news.length === 0) {
        if (tag) {
            const tags = await getAllTags();
            return textResult(`Aucune actualité${gameName ? ` pour ${gameName}` : ""} avec le tag « ${tag} ». Tags existants : ${tags.slice(0, 30).join(", ")}.`);
        }
        return textResult(result.total > 0 ? `Page ${args.page} vide : ${result.totalPages} page(s) au total.` : "Aucune actualité.");
    }

    return textResult(
        `${result.total} actualité${result.total > 1 ? "s" : ""}${gameName ? ` pour ${gameName}` : ""}${tag ? ` (#${tag})` : ""}, ` +
        `les plus récentes d'abord — page ${result.page}/${result.totalPages} :\n\n` +
        result.news.map((news) => describeNewsLine(news, args.lang, newsLink(news, args.lang))).join("\n\n") +
        (result.page < result.totalPages ? `\n\nPage suivante : page ${result.page + 1}.` : "") +
        "\n\nTexte complet : get_news avec l'id.",
    );
}

async function handleGetNews(args: { newsId: string; lang?: Locale }): Promise<ToolResult> {
    const news = await getNewsById(args.newsId);
    if (!news) return errorResult("Actualité introuvable.");
    return textResult(describeNews(news, args.lang, newsLink(news, args.lang)));
}

async function requireNewsWriter(extra: ServerContext): Promise<{ userId: string } | { error: ToolResult }> {
    const userId = userIdFrom(extra)!;
    if (!(await anyUserHasPermission([userId], NEWS_PERMISSION))) {
        return { error: errorResult("Réservé aux rédacteurs des actualités (permission news:update).") };
    }
    return { userId };
}

type NewsFields = {
    title?: string;
    summary?: string;
    content?: string;
    originalLang?: Locale;
    gameNames?: string[];
    tags?: string[];
    banner?: string;
    sourceName?: string;
    sourceUrl?: string;
};

/** La source, donnée en deux champs : les deux ou aucun. */
function sourceFrom(args: NewsFields): { source?: { name: string; url: string } } | { error: ToolResult } {
    const name = args.sourceName?.trim();
    const url = args.sourceUrl?.trim();
    if (!name && !url) return {};
    if (!name || !url) return { error: errorResult("La source se donne avec sourceName et sourceUrl ensemble.") };
    return { source: { name, url } };
}

/**
 * Une bannière s'affiche en image sur le site : comme pour la source, http(s)
 * et rien d'autre (`url()` du schéma accepte aussi `javascript:` et `data:`).
 */
function invalidBanner(banner: string | undefined): ToolResult | null {
    if (!banner) return null;
    try {
        if (/^https?:$/.test(new URL(banner).protocol)) return null;
    } catch {
        // Pas une URL : refusée ci-dessous.
    }
    return errorResult("banner doit être une adresse http(s).");
}

function cleanTags(tags: string[] | undefined): string[] | undefined {
    return tags ? [...new Set(tags.map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))] : undefined;
}

async function handleCreateNews(args: NewsFields & { title: string; summary: string; content: string }, extra: ServerContext): Promise<ToolResult> {
    const writer = await requireNewsWriter(extra);
    if ("error" in writer) return writer.error;

    const games = await resolveGameIds(args.gameNames ?? []);
    if ("error" in games) return games.error;
    const source = sourceFrom(args);
    if ("error" in source) return source.error;
    const badBanner = invalidBanner(args.banner);
    if (badBanner) return badBanner;

    const parsed = createNewsSchema.safeParse({
        title: args.title,
        summary: args.summary,
        content: args.content,
        originalLang: args.originalLang,
        gameIds: games.ids,
        tags: cleanTags(args.tags),
        ...(args.banner ? { banner: args.banner } : {}),
        ...(source.source ? { source: source.source } : {}),
    });
    if (!parsed.success) return invalid(parsed.error.issues);

    const created = await createNews(parsed.data, writer.userId);
    return textResult(`Actualité publiée : « ${created.title} » (id ${created.id}).` + linkLine(mcpLinks.news(newsPath(created.id, created.originalLang, created.originalLang))));
}

async function handleUpdateNews(
    args: NewsFields & { newsId: string; removeSource?: boolean },
    extra: ServerContext,
): Promise<ToolResult> {
    const writer = await requireNewsWriter(extra);
    if ("error" in writer) return writer.error;

    const current = await getNewsById(args.newsId);
    if (!current) return errorResult("Actualité introuvable.");

    let gameIds: string[] | undefined;
    if (args.gameNames) {
        const games = await resolveGameIds(args.gameNames);
        if ("error" in games) return games.error;
        gameIds = games.ids;
    }
    const source = sourceFrom(args);
    if ("error" in source) return source.error;
    if (args.removeSource && source.source) return errorResult("removeSource et une nouvelle source s'excluent.");
    const badBanner = invalidBanner(args.banner);
    if (badBanner) return badBanner;

    const parsed = updateNewsSchema.safeParse({
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(args.summary !== undefined ? { summary: args.summary } : {}),
        ...(args.content !== undefined ? { content: args.content } : {}),
        ...(args.originalLang ? { originalLang: args.originalLang } : {}),
        ...(gameIds ? { gameIds } : {}),
        ...(args.tags ? { tags: cleanTags(args.tags) } : {}),
        ...(args.banner ? { banner: args.banner } : {}),
        ...(source.source ? { source: source.source } : args.removeSource ? { source: null } : {}),
    });
    if (!parsed.success) return invalid(parsed.error.issues);
    const updated = await updateNews(args.newsId, parsed.data);
    if (!updated) return errorResult("Mise à jour impossible.");

    const textChanged = (["title", "summary", "content"] as const).some((field) => args[field] !== undefined && args[field] !== current[field]);
    const translated = (current.translations ?? []).length > 0;
    return textResult(
        `Actualité « ${args.title ?? current.title} » modifiée.` +
        (textChanged && translated ? " Ses traductions sont maintenant signalées comme à revoir." : "") +
        linkLine(newsLink(current)),
    );
}

const fieldShape = {
    summary: z.string().describe("Résumé affiché dans la liste et les aperçus (500 caractères au plus)"),
    content: z.string().describe("Corps de l'actualité, en Markdown"),
    originalLang: z.enum(locales).optional().describe("Langue du texte (défaut : fr)"),
    gameNames: z.array(z.string()).optional().describe("Jeux concernés, par nom ou slug"),
    tags: z.array(z.string()).optional(),
    banner: z.string().optional().describe("URL de l'image de bannière"),
    sourceName: z.string().optional().describe("Site d'origine d'une actualité reprise (avec sourceUrl)"),
    sourceUrl: z.string().optional().describe("Adresse de l'article d'origine (avec sourceName)"),
};

export function registerNewsTools(server: McpServer) {
    registerJoutesTool(server, "list_news", {
        title: "List news",
        description:
            "Les actualités de Joutes, les plus récentes d'abord : titre, date, jeux, tags et résumé, dans la langue demandée si elles y sont traduites. " +
            "Filtrables par jeu et par tag.",
        inputSchema: {
            gameName: z.string().optional().describe("Nom ou slug du jeu"),
            tag: z.string().optional(),
            lang: z.enum(locales).optional().describe("Langue de lecture (défaut : la VO de chaque actualité)"),
            page: z.number().int().min(1).default(1),
            limit: z.number().int().min(1).max(20).default(10),
        },
    }, withToolLogging("list_news", handleListNews));

    registerJoutesTool(server, "get_news", {
        title: "Get news",
        description: "Une actualité en entier (Markdown), avec sa source et les langues où elle se lit.",
        inputSchema: {
            newsId: z.string().describe("Id de l'actualité, lu dans list_news"),
            lang: z.enum(locales).optional().describe("Langue de lecture (défaut : la VO)"),
        },
    }, withToolLogging("get_news", handleGetNews));

    registerJoutesTool(server, "create_news", {
        title: "Create news",
        description:
            "Publier une actualité sur Joutes (visible de tous dès sa création). Une actualité reprise d'un autre site cite sa source. " +
            "Réservé aux rédacteurs des actualités.",
        inputSchema: {
            title: z.string().describe("Titre (200 caractères au plus)"),
            ...fieldShape,
        },
    }, withToolLogging("create_news", handleCreateNews));

    registerJoutesTool(server, "update_news", {
        title: "Update news",
        description:
            "Modifier une actualité ; seuls les champs fournis changent (gameNames et tags remplacent les listes). Change la VO : " +
            "les traductions éventuelles sont alors signalées comme à revoir. Réservé aux rédacteurs des actualités.",
        inputSchema: {
            newsId: z.string(),
            title: z.string().optional(),
            ...fieldShape,
            summary: fieldShape.summary.optional(),
            content: fieldShape.content.optional(),
            removeSource: z.boolean().optional().describe("Retirer la source"),
        },
    }, withToolLogging("update_news", handleUpdateNews));
}
