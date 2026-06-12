"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Policy } from "@/lib/types/policies";
import { searchPolicies } from "./actions";
import { Search, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import PolicyVoteButtons from "@/components/PolicyVoteButtons";
import EditPolicyDialog from "@/components/EditPolicyDialog";
import DeletePolicyButton from "@/components/DeletePolicyButton";

export default function PoliciesClientView({
  initialPolicies,
  initialTotalCount,
  initialPage,
  pageSize,
  gameId,
  gameSlug,
  userCanUpdatePolicies,
  userCanVotePolicies,
}: {
  initialPolicies: Policy[];
  initialTotalCount: number;
  initialPage: number;
  pageSize: number;
  gameId: string;
  gameSlug: string;
  userCanUpdatePolicies: boolean;
  userCanVotePolicies: boolean;
}) {
  const router = useRouter();
  const urlSearchParams = useSearchParams();

  const [policies, setPolicies] = useState(initialPolicies);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [isPending, startTransition] = useTransition();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const totalPages = Math.ceil(totalCount / pageSize);

  // Auto-expand single result
  useEffect(() => {
    if (policies.length === 1) {
      setExpandedIds(new Set([policies[0].id]));
    }
  }, [policies]);

  const fetchPolicies = (params: {
    search: string;
    sortOrder: "asc" | "desc";
    page: number;
  }) => {
    startTransition(async () => {
      const result = await searchPolicies({
        gameId,
        search: params.search,
        sortOrder: params.sortOrder,
        page: params.page,
        pageSize,
      });
      setPolicies(result.policies);
      setTotalCount(result.totalCount);
      setCurrentPage(params.page);

      const urlParams = new URLSearchParams(urlSearchParams.toString());
      if (params.page === 1) {
        urlParams.delete("page");
      } else {
        urlParams.set("page", String(params.page));
      }
      router.replace(`?${urlParams.toString()}`, { scroll: false });
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchPolicies({ search: value, sortOrder, page: 1 });
    }, 400);
  };

  const toggleSortOrder = () => {
    const newOrder = sortOrder === "desc" ? "asc" : "desc";
    setSortOrder(newOrder);
    fetchPolicies({ search: searchQuery, sortOrder: newOrder, page: 1 });
  };

  const goToPage = (page: number) => {
    fetchPolicies({ search: searchQuery, sortOrder, page });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <>
      {/* Filtres */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Rechercher dans les policies…"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline" onClick={toggleSortOrder} className="w-full sm:w-auto">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            Titre {sortOrder === "asc" ? "A→Z" : "Z→A"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {totalCount} policy{totalCount > 1 ? "s" : ""}
          {totalPages > 1 ? ` — page ${currentPage} / ${totalPages}` : ""}
        </p>
      </div>

      {/* Liste */}
      <div className={isPending ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
        {policies.length === 0 ? (
          <p className="text-muted-foreground">
            Aucune policy ne correspond aux critères de recherche.
          </p>
        ) : (
          <div className="space-y-4">
            {policies.map((policy) => {
              const isExpanded = expandedIds.has(policy.id);
              return (
                <div
                  key={policy.id}
                  className={`border rounded-lg bg-card shadow-sm ${policy.deprecatedAt ? "opacity-60" : ""}`}
                >
                  {/* Header — always visible, cliquable pour expand */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(policy.id)}
                    className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-muted/40 transition-colors rounded-t-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-semibold text-base truncate">{policy.title}</span>
                      {policy.deprecatedAt && (
                        <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                          Déprécié
                        </span>
                      )}
                    </div>
                    <span className="ml-4 shrink-0 text-muted-foreground text-xs">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </button>

                  {/* Body — visible uniquement si étendu */}
                  {isExpanded && (
                    <div className="px-6 pb-6 border-t pt-4">
                      {/* Actions */}
                      {userCanUpdatePolicies && (
                        <div className="flex gap-1 justify-end mb-3">
                          <EditPolicyDialog policy={policy} gameSlug={gameSlug} />
                          <DeletePolicyButton policyId={policy.id} gameSlug={gameSlug} />
                        </div>
                      )}

                      {/* Contenu Markdown */}
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw]}
                          components={{
                            img: ({ ...props }) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                {...props}
                                className="max-w-full rounded-md shadow-sm"
                                alt={props.alt ?? ""}
                              />
                            ),
                            a: ({ href, children, ...props }) => (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                                {...props}
                              >
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {policy.content}
                        </ReactMarkdown>
                      </div>

                      {/* Métadonnées bas */}
                      <div className="mt-4 pt-4 border-t flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            Ajouté le{" "}
                            {new Date(policy.createdAt).toLocaleDateString("fr-FR", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </span>
                          {policy.source && (
                            <a
                              href={policy.source}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Source →
                            </a>
                          )}
                          {policy.deprecatedAt && (
                            <span className="text-xs text-muted-foreground italic">
                              Déprécié le{" "}
                              {new Date(policy.deprecatedAt).toLocaleDateString("fr-FR", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </span>
                          )}
                        </div>

                        <PolicyVoteButtons
                          policyId={policy.id}
                          gameSlug={gameSlug}
                          votes={policy.votes}
                          userCanVote={userCanVotePolicies}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {currentPage} sur {totalPages} — {totalCount} policy{totalCount > 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1 || isPending}
              >
                <ChevronLeft className="h-4 w-4" />
                Précédent
              </Button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "…" ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">…</span>
                  ) : (
                    <Button
                      key={item}
                      variant={item === currentPage ? "default" : "outline"}
                      size="sm"
                      onClick={() => goToPage(item as number)}
                      disabled={isPending}
                    >
                      {item}
                    </Button>
                  )
                )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages || isPending}
              >
                Suivant
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

