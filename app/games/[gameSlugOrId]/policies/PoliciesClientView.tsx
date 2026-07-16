"use client";

import { useState, useTransition, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Policy } from "@/lib/types/policies";
import { searchPolicies } from "./actions";
import { Search, ArrowUpDown, ChevronLeft, ChevronRight, Link2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AnnotatedMarkdown from "@/components/AnnotatedMarkdown";
import LanguagePicker from "@/components/LanguagePicker";
import { CardNameMatch } from "@/lib/db/cards";
import PolicyVoteButtons from "@/components/PolicyVoteButtons";
import EditPolicyDialog from "@/components/EditPolicyDialog";
import DeletePolicyButton from "@/components/DeletePolicyButton";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { Locale } from "@/i18n/config";

export default function PoliciesClientView({
  initialPolicies,
  initialTotalCount,
  initialPage,
  initialCardIdByName,
  initialCardsById,
  pageSize,
  gameId,
  gameSlug,
  ruleLang,
  userCanUpdatePolicies,
  userCanVotePolicies,
}: {
  initialPolicies: Policy[];
  initialTotalCount: number;
  initialPage: number;
  initialCardIdByName: Record<string, string>;
  initialCardsById: Record<string, CardNameMatch>;
  pageSize: number;
  gameId: string;
  gameSlug: string;
  ruleLang: "en" | "fr";
  userCanUpdatePolicies: boolean;
  userCanVotePolicies: boolean;
}) {
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const t = useTranslations("Games");
  const locale = useLocale() as Locale;

  const [policies, setPolicies] = useState(initialPolicies);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [cardIdByName, setCardIdByName] = useState(initialCardIdByName);
  const [cardsById, setCardsById] = useState(initialCardsById);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [isPending, startTransition] = useTransition();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedLangs, setSelectedLangs] = useState<Record<string, Locale>>({});

  const resolvePolicyLang = (policy: Policy): Locale => {
    const availableLangs = [policy.originalLang, ...(policy.translations ?? []).map((tr) => tr.lang)];
    return selectedLangs[policy.id] ?? (availableLangs.includes(locale) ? locale : policy.originalLang);
  };

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const totalPages = Math.ceil(totalCount / pageSize);

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
      setCardIdByName(result.cardIdByName);
      setCardsById(result.cardsById);
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
    if (policies.length === 1) {
      return;
    }

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
      <div className="mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("policies.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline" onClick={toggleSortOrder} className="w-full sm:w-auto">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            {t("policies.sortTitle")} {sortOrder === "asc" ? "A→Z" : "Z→A"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {totalCount > 1 ? t("policies.countPlural", { count: totalCount }) : t("policies.countSingular", { count: totalCount })}
          {totalPages > 1 ? ` — ${t("policies.pageLabel", { currentPage, totalPages })}` : ""}
        </p>
      </div>

      <div className={isPending ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
        {policies.length === 0 ? (
          <p className="text-muted-foreground">
            {t("policies.empty")}
          </p>
        ) : (
          <div className="space-y-4">
            {policies.map((policy) => {
              const isExpanded = policies.length === 1 ? true : expandedIds.has(policy.id);
              const availableLangs = [policy.originalLang, ...(policy.translations ?? []).map((tr) => tr.lang)];
              const selectedLang = resolvePolicyLang(policy);
              const translation = policy.translations?.find((tr) => tr.lang === selectedLang);
              const resolvedTitle = selectedLang !== policy.originalLang ? translation?.title || policy.title : policy.title;
              const resolvedContent = selectedLang !== policy.originalLang ? translation?.content || policy.content : policy.content;

              return (
                <div
                  key={policy.id}
                  className={`border rounded-lg bg-card shadow-sm ${policy.deprecatedAt ? "opacity-60" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(policy.id)}
                    className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-muted/40 transition-colors rounded-t-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-semibold text-base truncate">{resolvedTitle}</span>
                      {policy.deprecatedAt && (
                        <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                          {t("policies.deprecated")}
                        </span>
                      )}
                    </div>
                    <span className="ml-4 shrink-0 text-muted-foreground text-xs">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-6 pb-6 border-t pt-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <LanguagePicker
                            availableLangs={availableLangs}
                            originalLang={policy.originalLang}
                            value={selectedLang}
                            onChange={(lang) => setSelectedLangs((prev) => ({ ...prev, [policy.id]: lang }))}
                            originalLabel={t("policies.originalLangLabel")}
                            ariaLabel={t("policies.languagePickerLabel")}
                          />
                          <Link
                            href={`/policies/${policy.id}`}
                            title={t("policies.permalink")}
                            aria-label={t("policies.permalink")}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                        {userCanUpdatePolicies && (
                          <div className="flex gap-1">
                            <EditPolicyDialog policy={policy} gameSlug={gameSlug} />
                            <DeletePolicyButton policyId={policy.id} gameSlug={gameSlug} />
                          </div>
                        )}
                      </div>

                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <AnnotatedMarkdown
                          content={resolvedContent}
                          cardIdByName={cardIdByName}
                          cardsById={cardsById}
                          gameSlug={gameSlug}
                          ruleLang={ruleLang}
                          allowRawHtml
                        />
                      </div>

                      <div className="mt-4 pt-4 border-t flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {t("policies.addedOn", { date: DateTime.fromJSDate(policy.createdAt).setLocale(locale).toLocaleString(DateTime.DATE_MED) })}
                          </span>
                          {policy.source && (
                            <a
                              href={policy.source}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              {t("policies.source")} →
                            </a>
                          )}
                          {policy.deprecatedAt && (
                            <span className="text-xs text-muted-foreground italic">
                              {t("policies.deprecatedOn", { date: DateTime.fromJSDate(policy.deprecatedAt).setLocale(locale).toLocaleString(DateTime.DATE_MED) })}
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

        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t("policies.paginationSummary", { currentPage, totalPages, count: totalCount })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1 || isPending}
              >
                <ChevronLeft className="h-4 w-4" />
                {t("policies.previous")}
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
                {t("policies.next")}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
