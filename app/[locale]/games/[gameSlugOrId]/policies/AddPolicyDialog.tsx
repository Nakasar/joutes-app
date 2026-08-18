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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPolicy } from "./actions";
import { useLocale, useTranslations } from "next-intl";
import { Locale, locales, localeLabels } from "@/i18n/config";

export default function AddPolicyDialog({ gameId }: { gameId: string; gameSlug: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  const interfaceLocale = useLocale() as Locale;
  const [originalLang, setOriginalLang] = useState<Locale>(interfaceLocale);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preview, setPreview] = useState(false);
  const [ReactMarkdown, setReactMarkdown] = useState<React.ComponentType<{ children: string; remarkPlugins?: unknown[]; rehypePlugins?: unknown[] }> | null>(null);
  const t = useTranslations("Games");

  const openDialog = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !ReactMarkdown) {
      const [{ default: MD }, { default: remarkGfm }, { default: rehypeRaw }] = await Promise.all([
        import("react-markdown"),
        import("remark-gfm"),
        import("rehype-raw"),
      ]);
      const MarkdownPreview = ({ children }: { children: string }) => (
        <MD remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{children}</MD>
      );
      MarkdownPreview.displayName = "MarkdownPreview";
      setReactMarkdown(() => MarkdownPreview);
    }
    if (!isOpen) {
      setPreview(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);
    try {
      await createPolicy({
        gameId,
        title: title.trim(),
        content: content.trim(),
        originalLang,
        source: source.trim() || undefined,
      });
      setOpen(false);
      setTitle("");
      setContent("");
      setSource("");
      setPreview(false);
    } catch (error) {
      console.error("Erreur lors de la création de la policy:", error);
      alert(t("policies.addDialog.errors.createError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button>{t("policies.addDialog.trigger")}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("policies.addDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("policies.addDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="title" className="text-sm font-medium">{t("policies.addDialog.fields.title")}</label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("policies.addDialog.fields.titlePlaceholder")}
                required
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="originalLang" className="text-sm font-medium">
                {t("policies.addDialog.fields.originalLang")}
              </label>
              <Select value={originalLang} onValueChange={(value) => setOriginalLang(value as Locale)}>
                <SelectTrigger id="originalLang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locales.map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {localeLabels[lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="content" className="text-sm font-medium">{t("policies.addDialog.fields.content")}</label>
                <button
                  type="button"
                  onClick={() => setPreview((v) => !v)}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  {preview ? t("policies.addDialog.fields.edit") : t("policies.addDialog.fields.preview")}
                </button>
              </div>
              {preview && ReactMarkdown ? (
                <div className="min-h-[200px] rounded-md border border-input bg-muted/40 px-4 py-3 prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{content}</ReactMarkdown>
                </div>
              ) : (
                <textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  className="min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                  placeholder={t("policies.addDialog.fields.contentPlaceholder")}
                />
              )}
              <p className="text-xs text-muted-foreground">
                {t("policies.addDialog.fields.markdownHint")}
              </p>
            </div>
            <div className="grid gap-2">
              <label htmlFor="source" className="text-sm font-medium">{t("policies.addDialog.fields.source")}</label>
              <Input
                id="source"
                type="url"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={t("policies.addDialog.fields.sourcePlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              {t("policies.addDialog.actions.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting || !title.trim() || !content.trim()}>
              {isSubmitting ? t("policies.addDialog.actions.submitting") : t("policies.addDialog.actions.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
