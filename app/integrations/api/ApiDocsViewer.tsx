"use client";

import openapiSpec from "@/app/api/docs/openapi.json";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { useState } from "react";

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

type Parameter = {
    name: string;
    in: string;
    description?: string;
    required?: boolean;
    example?: unknown;
    schema?: {
        type?: string;
        enum?: string[];
    };
};

type Operation = {
    summary?: string;
    description?: string;
    deprecated?: boolean;
    operationId?: string;
    parameters?: Parameter[];
    responses?: Record<string, { description?: string; content?: Record<string, unknown> }>;
};

type PathItem = Partial<Record<HttpMethod, Operation>>;

const METHOD_STYLES: Record<HttpMethod, string> = {
    get: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
    post: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    put: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
    patch: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
    delete: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
};

const HTTP_METHODS: HttpMethod[] = ["get", "post", "put", "patch", "delete"];

const BASE_URL = "https://api.joutes.app/";

function getRouteGroups(paths: Record<string, PathItem>): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const path of Object.keys(paths)) {
        const segment = path.split("/").filter(Boolean)[0] ?? "other";
        if (!groups.has(segment)) groups.set(segment, []);
        groups.get(segment)!.push(path);
    }
    return groups;
}

function groupLabel(segment: string): string {
    const labels: Record<string, string> = {
        collection: "Collection",
        games: "Jeux",
        lairs: "Repaires",
        events: "Événements",
        news: "Actualités",
        decks: "Decks",
        leagues: "Ligues",
    };
    return labels[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    function handleCopy() {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }
    return (
        <button
            onClick={handleCopy}
            className="ml-2 p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Copier"
        >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
    );
}

function ParameterRow({ param }: { param: Parameter }) {
    return (
        <div className="flex flex-wrap items-start gap-2 py-2 border-b last:border-0 border-border/50">
            <div className="flex items-center gap-2 min-w-[180px]">
                <code className="text-sm font-mono font-semibold text-foreground">{param.name}</code>
                {param.required && (
                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide">requis</span>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2 flex-1">
                <Badge variant="outline" className="text-xs capitalize font-mono">
                    {param.in}
                </Badge>
                {param.schema?.type && (
                    <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
                        {param.schema.type}
                    </Badge>
                )}
                {param.schema?.enum && (
                    <span className="text-xs text-muted-foreground">
                        {param.schema.enum.map((v) => (
                            <code key={v} className="mx-0.5 px-1 py-0.5 rounded bg-muted font-mono">{v}</code>
                        ))}
                    </span>
                )}
                {param.description && (
                    <span className="text-sm text-muted-foreground">{param.description}</span>
                )}
                {param.example !== undefined && (
                    <span className="text-xs text-muted-foreground">
                        ex.&nbsp;<code className="font-mono">{String(param.example)}</code>
                    </span>
                )}
            </div>
        </div>
    );
}

function OperationDetail({ operation }: { operation: Operation }) {
    const params = operation.parameters ?? [];
    const pathParams = params.filter((p) => p.in === "path");
    const queryParams = params.filter((p) => p.in === "query");

    return (
        <div className="pt-3 space-y-4">
            {operation.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{operation.description}</p>
            )}

            {pathParams.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Paramètres de chemin
                    </h4>
                    <div className="rounded-md border border-border bg-muted/30 px-3 divide-y divide-border/50">
                        {pathParams.map((p) => (
                            <ParameterRow key={p.name} param={p} />
                        ))}
                    </div>
                </div>
            )}

            {queryParams.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Paramètres de requête
                    </h4>
                    <div className="rounded-md border border-border bg-muted/30 px-3 divide-y divide-border/50">
                        {queryParams.map((p) => (
                            <ParameterRow key={p.name} param={p} />
                        ))}
                    </div>
                </div>
            )}

            {operation.responses && (
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Réponses
                    </h4>
                    <div className="rounded-md border border-border bg-muted/30 px-3 divide-y divide-border/50">
                        {Object.entries(operation.responses).map(([code, response]) => (
                            <div key={code} className="flex items-center gap-3 py-2">
                                <code
                                    className={`text-sm font-mono font-bold min-w-[48px] ${
                                        code.startsWith("2")
                                            ? "text-emerald-600 dark:text-emerald-400"
                                            : code.startsWith("4")
                                            ? "text-amber-600 dark:text-amber-400"
                                            : "text-red-600 dark:text-red-400"
                                    }`}
                                >
                                    {code}
                                </code>
                                {response.description && (
                                    <span className="text-sm text-muted-foreground">{response.description}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function RouteCard({ path, pathItem }: { path: string; pathItem: PathItem }) {
    const [expandedMethod, setExpandedMethod] = useState<HttpMethod | null>(null);

    const methods = HTTP_METHODS.filter((m) => m in pathItem && pathItem[m]);

    return (
        <Card className="overflow-hidden">
            <div className="divide-y divide-border">
                {methods.map((method) => {
                    const operation = pathItem[method]!;
                    const isExpanded = expandedMethod === method;

                    return (
                        <div key={method}>
                            <button
                                onClick={() => setExpandedMethod(isExpanded ? null : method)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors group"
                            >
                                <span
                                    className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded border font-mono min-w-[52px] text-center ${METHOD_STYLES[method]}`}
                                >
                                    {method}
                                </span>
                                <code className="text-sm font-mono text-foreground flex-1">
                                    <span className="text-muted-foreground">
                                        {BASE_URL}
                                    </span>
                                    {path}
                                </code>
                                {operation.summary && (
                                    <span className="text-sm text-muted-foreground hidden sm:block truncate max-w-[280px]">
                                        {operation.summary}
                                    </span>
                                )}
                                {operation.deprecated && (
                                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                                        Déprécié
                                    </Badge>
                                )}
                                <span className="text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0">
                                    {isExpanded ? (
                                        <ChevronDown className="h-4 w-4" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4" />
                                    )}
                                </span>
                            </button>

                            {isExpanded && (
                                <div className="px-4 pb-4 bg-muted/20 border-t border-border/60">
                                    <OperationDetail operation={operation} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

function RouteGroup({ segment, paths }: { segment: string; paths: string[] }) {
    const spec = openapiSpec as { paths: Record<string, PathItem> };

    return (
        <section className="space-y-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
                <span className="h-px flex-1 bg-border" />
                <span>{groupLabel(segment)}</span>
                <span className="h-px flex-1 bg-border" />
            </h2>
            <div className="space-y-2">
                {paths.map((path) => (
                    <RouteCard key={path} path={path} pathItem={spec.paths[path]} />
                ))}
            </div>
        </section>
    );
}

export default function ApiDocsViewer() {
    const spec = openapiSpec as { paths: Record<string, PathItem>; info: { title: string; version: string } };
    const groups = getRouteGroups(spec.paths);

    return (
        <div className="space-y-8">
            {/* Info bloc */}
            <Card className="bg-muted/30">
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Base URL
                            </p>
                            <div className="flex items-center mt-1">
                                <code className="text-sm font-mono text-foreground">{BASE_URL}</code>
                                <CopyButton text={BASE_URL} />
                            </div>
                        </div>
                        <Badge variant="outline" className="font-mono text-xs">
                            v{spec.info.version}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${METHOD_STYLES.get}`} />
                            GET
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${METHOD_STYLES.post}`} />
                            POST
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${METHOD_STYLES.patch}`} />
                            PATCH
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${METHOD_STYLES.delete}`} />
                            DELETE
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Routes par groupe */}
            {Array.from(groups.entries()).map(([segment, paths]) => (
                <RouteGroup key={segment} segment={segment} paths={paths} />
            ))}
        </div>
    );
}
