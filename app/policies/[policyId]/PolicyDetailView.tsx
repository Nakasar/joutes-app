"use client";

import { useState } from "react";
import { Policy } from "@/lib/types/policies";
import { CardNameMatch } from "@/lib/db/cards";
import { Locale } from "@/i18n/config";
import AnnotatedMarkdown from "@/components/AnnotatedMarkdown";
import LanguagePicker from "@/components/LanguagePicker";
import StaleTranslationWarning from "@/components/StaleTranslationWarning";
import EditPolicyDialog from "@/components/EditPolicyDialog";
import DeletePolicyButton from "@/components/DeletePolicyButton";
import PolicyVoteButtons from "@/components/PolicyVoteButtons";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";

export default function PolicyDetailView({
  policy,
  gameSlug,
  ruleLang,
  cardIdByName,
  cardsById,
  interfaceLocale,
  userCanUpdatePolicies,
  userCanVotePolicies,
}: {
  policy: Policy;
  gameSlug: string;
  ruleLang: "en" | "fr";
  cardIdByName: Record<string, string>;
  cardsById: Record<string, CardNameMatch>;
  interfaceLocale: Locale;
  userCanUpdatePolicies: boolean;
  userCanVotePolicies: boolean;
}) {
  const t = useTranslations("Games");
  const availableLangs: Locale[] = [policy.originalLang, ...(policy.translations ?? []).map((tr) => tr.lang)];
  const [selectedLang, setSelectedLang] = useState<Locale>(
    availableLangs.includes(interfaceLocale) ? interfaceLocale : policy.originalLang
  );
  const translation = policy.translations?.find((tr) => tr.lang === selectedLang);
  const isShowingTranslation = selectedLang !== policy.originalLang && !!translation;
  const resolvedTitle = isShowingTranslation ? translation!.title || policy.title : policy.title;
  const resolvedContent = isShowingTranslation ? translation!.content || policy.content : policy.content;
  const isStale =
    isShowingTranslation && !!translation?.content && translation.updatedAt < policy.contentUpdatedAt;

  return (
    <div className={`border rounded-lg bg-card shadow-sm p-6 ${policy.deprecatedAt ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-bold">{resolvedTitle}</h1>
        {policy.deprecatedAt && (
          <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
            {t("policies.deprecated")}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <LanguagePicker
          availableLangs={availableLangs}
          originalLang={policy.originalLang}
          value={selectedLang}
          onChange={setSelectedLang}
          originalLabel={t("policies.originalLangLabel")}
          ariaLabel={t("policies.languagePickerLabel")}
        />
        {userCanUpdatePolicies && (
          <div className="flex gap-1">
            <EditPolicyDialog policy={policy} gameSlug={gameSlug} />
            <DeletePolicyButton policyId={policy.id} gameSlug={gameSlug} />
          </div>
        )}
      </div>

      {isStale && <StaleTranslationWarning message={t("policies.staleTranslationWarning")} />}

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
            {t("policies.addedOn", {
              date: DateTime.fromJSDate(policy.createdAt).setLocale(interfaceLocale).toLocaleString(DateTime.DATE_MED),
            })}
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
              {t("policies.deprecatedOn", {
                date: DateTime.fromJSDate(policy.deprecatedAt).setLocale(interfaceLocale).toLocaleString(DateTime.DATE_MED),
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
  );
}
