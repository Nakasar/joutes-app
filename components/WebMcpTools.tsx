"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { registerWebMcpTools } from "@/lib/webmcp/register";
import { createJoutesWebMcpTools } from "@/lib/webmcp/tools";

/**
 * Déclare les outils WebMCP de Joutes auprès du navigateur, sur toutes les
 * pages (le composant est monté par le layout racine).
 *
 * Ne rend rien : un agent qui ouvre le site y trouve les outils sans que la
 * page change d'un pixel. Les outils sont retirés au démontage via
 * l'`AbortController`, de sorte qu'un remontage (Fast Refresh, mode strict en
 * développement) ne laisse pas de doublons derrière lui.
 *
 * WebMCP peut aussi être injecté par une extension après le chargement : la
 * déclaration est donc retentée quelques fois, sur les quatre premières
 * secondes de la page, puis abandonnée — le site n'a pas à sonder le
 * navigateur indéfiniment.
 */
const RETRY_DELAYS_MS = [250, 500, 1_000, 2_000];

export default function WebMcpTools() {
    const router = useRouter();

    useEffect(() => {
        const controller = new AbortController();
        const tools = createJoutesWebMcpTools({
            fetch: (input, init) => fetch(input, init),
            navigate: (path) => router.push(path),
            currentPage: () => ({
                url: window.location.href,
                path: window.location.pathname,
                title: document.title,
            }),
        });

        const timers: ReturnType<typeof setTimeout>[] = [];

        const attempt = async (remainingDelays: number[]) => {
            if (controller.signal.aborted) return;

            // Le rapport n'est fiable qu'une fois les déclarations résolues :
            // un navigateur peut accepter l'appel et rejeter la promesse.
            const report = await registerWebMcpTools(tools, { signal: controller.signal });
            if (controller.signal.aborted) return;

            for (const error of report.errors) {
                console.error(`[WebMCP] ${error}`);
            }
            if (report.surfaces.length > 0) return;

            const [delay, ...rest] = remainingDelays;
            if (delay === undefined) return;
            timers.push(setTimeout(() => void attempt(rest), delay));
        };

        void attempt(RETRY_DELAYS_MS);

        return () => {
            controller.abort();
            for (const timer of timers) clearTimeout(timer);
        };
    }, [router]);

    return null;
}
