/**
 * Les textes des outils MCP des actualités, en fonctions pures.
 *
 * Une actualité se lit dans la langue demandée quand elle y est traduite, et
 * sinon dans sa VO, champ par champ, comme sur le site (`localizeNews`).
 */

import type { Locale } from "@/i18n/config";
import type { News } from "@/lib/types/News";
import { availableNewsLangs, localizeNews, newsOriginalLang, resolveNewsLang } from "@/lib/news/localize";

function day(date: Date | string): string {
    const value = new Date(date);
    if (Number.isNaN(value.getTime())) return "";
    return value.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
}

/** La langue servie : celle demandée si l'actualité y existe, sinon sa VO. */
export function newsLang(news: Pick<News, "originalLang" | "translations">, requested?: Locale): Locale {
    return resolveNewsLang(news, requested);
}

function gamesText(news: Pick<News, "games">): string {
    return news.games && news.games.length > 0 ? news.games.map((game) => game.name).join(", ") : "";
}

/** Une ligne de la liste : date, titre, jeux, tags, résumé, id et lien. */
export function describeNewsLine(news: News, lang: Locale | undefined, link: string): string {
    const served = newsLang(news, lang);
    const localized = localizeNews(news, served);
    const games = gamesText(news);
    return [
        `- **${localized.title.text}** — ${day(news.createdAt)}` +
        (games ? ` · ${games}` : "") +
        (news.tags.length > 0 ? ` · ${news.tags.map((tag) => `#${tag}`).join(" ")}` : ""),
        `  ${localized.summary.text}`,
        `  id ${news.id} · ${link}`,
    ].join("\n");
}

/** Une actualité en entier, avec sa source et les langues où elle se lit. */
export function describeNews(news: News, lang: Locale | undefined, link: string): string {
    const served = newsLang(news, lang);
    const localized = localizeNews(news, served);
    const original = newsOriginalLang(news);
    const games = gamesText(news);
    const author = news.author?.displayName
        ? `${news.author.displayName}${news.author.discriminator ? `#${news.author.discriminator}` : ""}`
        : undefined;

    const meta = [
        `Publiée le ${day(news.createdAt)}`,
        author ? `par ${author}` : "",
        games ? `jeux : ${games}` : "",
        news.tags.length > 0 ? `tags : ${news.tags.join(", ")}` : "",
        `${news.likesCount} j'aime`,
    ].filter(Boolean).join(" · ");

    const langs = availableNewsLangs(news);
    const langNote = localized.isTranslation
        ? `Traduction ${served} (VO ${original})${localized.isStale ? ", peut-être en retard sur la VO" : ""}.`
        : lang && lang !== served
            ? `Pas de traduction en ${lang} : texte en VO (${original}).`
            : `VO (${original}).`;

    return [
        `# ${localized.title.text}`,
        meta,
        `${langNote} Langues disponibles : ${langs.join(", ")}.`,
        news.source ? `Source : ${news.source.name} — ${news.source.url}` : "",
        "",
        `_${localized.summary.text}_`,
        "",
        localized.content.text,
        "",
        `id ${news.id} · Lien : ${link}`,
    ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n").replace(/\n{3,}/g, "\n\n");
}
