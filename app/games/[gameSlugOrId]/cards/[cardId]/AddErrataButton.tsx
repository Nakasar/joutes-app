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
import { createErrata } from "@/app/games/[gameSlugOrId]/actions";
import { ErrataType } from "@/lib/types/errata";
import { useTranslations } from "next-intl";

export default function AddErrataButton({ cardId }: { cardId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ErrataType>("errata");
  const [details, setDetails] = useState("");
  const [source, setSource] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errataDate, setErrataDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const t = useTranslations("Games");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await createErrata({
        cardId,
        type,
        details,
        source: source.trim() || undefined,
        errataDate: new Date(errataDate),
      });

      setOpen(false);
      setType("errata");
      setDetails("");
      setSource("");
    } catch (error) {
      console.error("Erreur lors de la création de l'errata:", error);
      alert(t("cards.detail.addErrata.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{t("cards.detail.addErrata.trigger")}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("cards.detail.addErrata.title")}</DialogTitle>
            <DialogDescription>
              {t("cards.detail.addErrata.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="type" className="text-sm font-medium">
                {t("cards.detail.addErrata.fields.type")}
              </label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as ErrataType)}
              >
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
                {t("cards.detail.addErrata.fields.date")}
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
                {t("cards.detail.addErrata.fields.details")}
              </label>
              <textarea
                id="details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                required
                className="min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={t("cards.detail.addErrata.fields.detailsPlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="source" className="text-sm font-medium">
                {t("cards.detail.addErrata.fields.source")}
              </label>
              <Input
                id="source"
                type="url"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={t("cards.detail.addErrata.fields.sourcePlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("cards.detail.addErrata.actions.submitting") : t("cards.detail.addErrata.actions.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
