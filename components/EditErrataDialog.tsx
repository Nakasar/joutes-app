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
import { updateErrata } from "@/app/games/[gameSlugOrId]/actions";
import { Errata, ErrataType } from "@/lib/types/errata";
import { BoosterCard } from "@/lib/types/booster";
import { Pencil, X } from "lucide-react";
import ErrataCardsPicker from "@/components/ErrataCardsPicker";
import { useTranslations } from "next-intl";
import { Locale, locales, localeLabels } from "@/i18n/config";

export default function EditErrataDialog({
  errata,
  cardId,
  gameSlugOrId,
}: {
  errata: Errata;
  cardId?: string;
  gameSlugOrId: string;
}) {
  const t = useTranslations("Games");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ErrataType>(errata.type);
  const [details, setDetails] = useState(errata.details);
  const [source, setSource] = useState(errata.source || "");
  const [errataDate, setErrataDate] = useState(
    errata.errataDate ? new Date(errata.errataDate).toISOString().split("T")[0] : ""
  );
  const [deprecatedAt, setDeprecatedAt] = useState(
    errata.deprecatedAt ? new Date(errata.deprecatedAt).toISOString().split("T")[0] : ""
  );
  const [selectedCards, setSelectedCards] = useState<BoosterCard[]>(errata.cards ?? []);
  const translationLangs = locales.filter((l) => l !== errata.originalLang);
  const [translationTexts, setTranslationTexts] = useState<Record<Locale, string>>(() =>
    Object.fromEntries(
      translationLangs.map((l) => [l, errata.translations?.find((tr) => tr.lang === l)?.details ?? ""])
    ) as Record<Locale, string>
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedCards.length === 0) {
      alert(t("cards.detail.editErrata.minCardsError"));
      return;
    }

    setIsSubmitting(true);

    try {
      const newCardIds = selectedCards.map((c) => c.id);
      const translations = translationLangs
        .map((lang) => ({ lang, details: translationTexts[lang].trim() }))
        .filter((tr) => tr.details.length > 0);

      await updateErrata(
        errata.id,
        {
          type,
          details,
          source: source.trim() || undefined,
          errataDate: new Date(errataDate),
          deprecatedAt: deprecatedAt ? new Date(deprecatedAt) : null,
          cardIds: newCardIds,
          translations,
        },
        Array.from(new Set([...errata.cardIds, ...newCardIds, ...(cardId ? [cardId] : [])]))
      );

      setOpen(false);
    } catch (error) {
      console.error("Erreur lors de la modification de l'errata:", error);
      alert(t("cards.detail.editErrata.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[625px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("cards.detail.editErrata.title")}</DialogTitle>
            <DialogDescription>
              {t("cards.detail.editErrata.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">
                {t("cards.detail.editErrata.fields.linkedCards")}
              </label>
              <ErrataCardsPicker
                gameSlugOrId={gameSlugOrId}
                selectedCards={selectedCards}
                onChange={setSelectedCards}
                searchPlaceholder={t("cards.detail.editErrata.fields.additionalCardsSearchPlaceholder")}
                emptyMessage={t("cards.detail.editErrata.fields.additionalCardsEmpty")}
                searchingLabel={t("cards.detail.editErrata.fields.additionalCardsSearching")}
                getRemoveLabel={(cardName) => t("cards.detail.editErrata.fields.removeCard", { cardName })}
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="type" className="text-sm font-medium">
                {t("cards.detail.editErrata.fields.type")}
              </label>
              <Select value={type} onValueChange={(v) => setType(v as ErrataType)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="errata">{t("cards.detail.errataTypes.errata")}</SelectItem>
                  <SelectItem value="clarification">{t("cards.detail.errataTypes.clarification")}</SelectItem>
                  <SelectItem value="ruling">{t("cards.detail.errataTypes.ruling")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <label htmlFor="errataDate" className="text-sm font-medium">
                {t("cards.detail.editErrata.fields.date")}
              </label>
              <Input
                id="errataDate"
                type="date"
                value={errataDate}
                onChange={(e) => setErrataDate(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="details" className="text-sm font-medium">
                {t("cards.detail.editErrata.fields.details")}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {t("cards.detail.editErrata.fields.originalLangBadge", { lang: localeLabels[errata.originalLang] })}
                </span>
              </label>
              <textarea
                id="details"
                className="min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium">{t("cards.detail.editErrata.fields.translations")}</span>
              {translationLangs.map((lang) => (
                <div key={lang} className="grid gap-1">
                  <label htmlFor={`translation-${lang}`} className="text-xs text-muted-foreground">
                    {localeLabels[lang]}
                  </label>
                  <textarea
                    id={`translation-${lang}`}
                    className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={translationTexts[lang]}
                    onChange={(e) => setTranslationTexts((prev) => ({ ...prev, [lang]: e.target.value }))}
                    placeholder={t("cards.detail.editErrata.fields.translationPlaceholder")}
                  />
                </div>
              ))}
            </div>

            <div className="grid gap-2">
              <label htmlFor="source" className="text-sm font-medium">
                {t("cards.detail.editErrata.fields.source")}
              </label>
              <Input
                id="source"
                type="url"
                placeholder={t("cards.detail.editErrata.fields.sourcePlaceholder")}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="deprecatedAt" className="text-sm font-medium">
                {t("cards.detail.editErrata.fields.deprecatedAt")}
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
                    title={t("cards.detail.editErrata.fields.removeDeprecation")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              {t("cards.detail.editErrata.actions.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? t("cards.detail.editErrata.actions.submitting")
                : t("cards.detail.editErrata.actions.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
