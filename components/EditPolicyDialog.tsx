"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { updatePolicy } from "@/app/games/[gameSlugOrId]/policies/actions";
import { Policy, PolicyTranslation } from "@/lib/types/policies";
import { Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Locale, locales, localeLabels } from "@/i18n/config";
import React from "react";

export default function EditPolicyDialog({
  policy,
  gameSlug,
}: {
  policy: Policy;
  gameSlug: string;
}) {
  const t = useTranslations("Games");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(policy.title);
  const [content, setContent] = useState(policy.content);
  const [source, setSource] = useState(policy.source || "");
  const [deprecatedAt, setDeprecatedAt] = useState(
    policy.deprecatedAt ? new Date(policy.deprecatedAt).toISOString().split("T")[0] : ""
  );
  const translationLangs = locales.filter((l) => l !== policy.originalLang);
  const [translations, setTranslations] = useState<Record<Locale, { title: string; content: string }>>(() =>
    Object.fromEntries(
      translationLangs.map((l) => {
        const existing = policy.translations?.find((tr) => tr.lang === l);
        return [l, { title: existing?.title ?? "", content: existing?.content ?? "" }];
      })
    ) as Record<Locale, { title: string; content: string }>
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preview, setPreview] = useState(false);
  const [ReactMarkdown, setReactMarkdown] = useState<React.ComponentType<{ children: string; remarkPlugins?: unknown[]; rehypePlugins?: unknown[] }> | null>(null);

  const openDialog = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !ReactMarkdown) {
      const [{ default: MD }, { default: remarkGfm }, { default: rehypeRaw }] = await Promise.all([
        import("react-markdown"),
        import("remark-gfm"),
        import("rehype-raw"),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setReactMarkdown(() => (props: any) => <MD remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} {...props} />);
    }
    if (!isOpen) setPreview(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const resolvedTranslations: PolicyTranslation[] = translationLangs
        .map((lang) => ({ lang, title: translations[lang].title.trim(), content: translations[lang].content.trim() }))
        .filter((tr) => tr.title.length > 0 || tr.content.length > 0);

      await updatePolicy(policy.id, gameSlug, {
        title: title.trim(),
        content: content.trim(),
        source: source.trim() || undefined,
        deprecatedAt: deprecatedAt ? new Date(deprecatedAt) : null,
        translations: resolvedTranslations,
      });
      setOpen(false);
    } catch (error) {
      console.error("Erreur lors de la modification de la policy:", error);
      alert(t("policies.editDialog.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("policies.editDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("policies.editDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="title" className="text-sm font-medium">
                {t("policies.editDialog.fields.title")}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {t("policies.editDialog.fields.originalLangBadge", { lang: localeLabels[policy.originalLang] })}
                </span>
              </label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="content" className="text-sm font-medium">{t("policies.editDialog.fields.content")}</label>
                <button
                  type="button"
                  onClick={() => setPreview((v) => !v)}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  {preview ? t("policies.editDialog.fields.edit") : t("policies.editDialog.fields.preview")}
                </button>
              </div>
              {preview && ReactMarkdown ? (
                <div className="min-h-[200px] rounded-md border border-input bg-muted/40 px-4 py-3 prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{content}</ReactMarkdown>
                </div>
              ) : (
                <textarea
                  id="content"
                  className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                />
              )}
            </div>

            <div className="grid gap-3">
              <span className="text-sm font-medium">{t("policies.editDialog.fields.translations")}</span>
              {translationLangs.map((lang) => (
                <div key={lang} className="grid gap-2 rounded-md border p-3">
                  <span className="text-xs font-semibold text-muted-foreground">{localeLabels[lang]}</span>
                  <label htmlFor={`translation-title-${lang}`} className="sr-only">
                    {t("policies.editDialog.fields.title")} ({localeLabels[lang]})
                  </label>
                  <Input
                    id={`translation-title-${lang}`}
                    value={translations[lang].title}
                    onChange={(e) =>
                      setTranslations((prev) => ({ ...prev, [lang]: { ...prev[lang], title: e.target.value } }))
                    }
                    placeholder={t("policies.editDialog.fields.translationTitlePlaceholder")}
                  />
                  <label htmlFor={`translation-content-${lang}`} className="sr-only">
                    {t("policies.editDialog.fields.content")} ({localeLabels[lang]})
                  </label>
                  <textarea
                    id={`translation-content-${lang}`}
                    className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                    value={translations[lang].content}
                    onChange={(e) =>
                      setTranslations((prev) => ({ ...prev, [lang]: { ...prev[lang], content: e.target.value } }))
                    }
                    placeholder={t("policies.editDialog.fields.translationContentPlaceholder")}
                  />
                </div>
              ))}
            </div>

            <div className="grid gap-2">
              <label htmlFor="source" className="text-sm font-medium">{t("policies.editDialog.fields.source")}</label>
              <Input
                id="source"
                type="url"
                placeholder={t("policies.editDialog.fields.sourcePlaceholder")}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="deprecatedAt" className="text-sm font-medium">
                {t("policies.editDialog.fields.deprecatedAt")}
              </label>
              <div className="flex gap-2">
                <Input
                  id="deprecatedAt"
                  type="date"
                  value={deprecatedAt}
                  onChange={(e) => setDeprecatedAt(e.target.value)}
                  className="flex-1"
                />
                {deprecatedAt && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setDeprecatedAt("")}
                    title={t("policies.editDialog.fields.removeDeprecation")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              {t("policies.editDialog.actions.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("policies.editDialog.actions.submitting") : t("policies.editDialog.actions.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
