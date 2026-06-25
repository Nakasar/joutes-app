"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

const CONDITIONS = ["Damaged", "Played", "Good", "Near Mint", "Mint"] as const;
const PRIMARY_LANGUAGES = [
  { code: "FR", label: "🇫🇷 Français" },
  { code: "EN", label: "🇬🇧 Anglais" },
  { code: "ZH", label: "🇨🇳 Chinois" },
] as const;
const SECONDARY_LANGUAGES = [
  { code: "IT", label: "🇮🇹 Italien" },
  { code: "JA", label: "🇯🇵 Japonais" },
  { code: "KO", label: "🇰🇷 Coréen" },
] as const;
const CURRENCIES = ["EUR", "USD", "GBP", "JPY", "CNY"] as const;

type Condition = (typeof CONDITIONS)[number];
type LanguageCode =
  | (typeof PRIMARY_LANGUAGES)[number]["code"]
  | (typeof SECONDARY_LANGUAGES)[number]["code"];
type CurrencyCode = (typeof CURRENCIES)[number];

type CollectionEntry = {
  id: string;
  foil?: boolean;
  language?: LanguageCode;
  condition?: Condition;
  grade?: number;
  obtainedAt?: string;
  acquisitionPrice?: number;
  acquisitionCurrency?: CurrencyCode;
};

type CollectionManagerProps = {
  cardId: string;
  gameSlug: string;
  cardName: string;
  setCode: string;
  collectorNumber: string;
  image: string;
};

export default function CollectionManager({
  cardId,
  gameSlug,
  cardName,
  setCode,
  collectorNumber,
  image,
}: CollectionManagerProps) {
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Add form state
  const [foil, setFoil] = useState(false);
  const [language, setLanguage] = useState<LanguageCode | "">("");
  const [condition, setCondition] = useState<Condition | "">("");
  const [grade, setGrade] = useState("");
  const [obtainedAt, setObtainedAt] = useState(DateTime.now().toISODate());
  const [acquisitionPrice, setAcquisitionPrice] = useState("");
  const [acquisitionCurrency, setAcquisitionCurrency] = useState<CurrencyCode>("EUR");
  const [adding, setAdding] = useState(false);
  const locale = useLocale();
  const t = useTranslations("Games");
  const primaryLanguages = [
    { code: "FR" as const, label: t("cards.collection.languages.fr") },
    { code: "EN" as const, label: t("cards.collection.languages.en") },
    { code: "ZH" as const, label: t("cards.collection.languages.zh") },
  ];
  const secondaryLanguages = [
    { code: "IT" as const, label: t("cards.collection.languages.it") },
    { code: "JA" as const, label: t("cards.collection.languages.ja") },
    { code: "KO" as const, label: t("cards.collection.languages.ko") },
  ];
  const conditionOptions = [
    { value: "Damaged" as const, label: t("cards.collection.conditions.damaged") },
    { value: "Played" as const, label: t("cards.collection.conditions.played") },
    { value: "Good" as const, label: t("cards.collection.conditions.good") },
    { value: "Near Mint" as const, label: t("cards.collection.conditions.nearMint") },
    { value: "Mint" as const, label: t("cards.collection.conditions.mint") },
  ];

  useEffect(() => {
    let active = true;

    async function fetchEntries() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/collection/cards/${encodeURIComponent(cardId)}?gameSlug=${encodeURIComponent(gameSlug)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setEntries(Array.isArray(data.cards) ? data.cards : []);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchEntries();

    return () => {
      active = false;
    };
  }, [cardId, gameSlug]);

  async function addCard() {
    setAdding(true);
    try {
      const body: Record<string, unknown> = {
        cardId,
        name: cardName,
        setCode,
        collectorNumber,
        image,
      };
      if (foil) body.foil = true;
      if (language.trim()) body.language = language.trim();
      if (condition) body.condition = condition;
      if (grade !== "") body.grade = parseFloat(grade);
      if (obtainedAt) body.obtainedAt = obtainedAt;
      if (acquisitionPrice !== "") {
        body.acquisitionPrice = parseFloat(acquisitionPrice);
        body.acquisitionCurrency = acquisitionCurrency;
      }

      const res = await fetch(`/api/collection/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setEntries((prev) => [
          ...prev,
          {
            id: data.id,
            foil: foil || undefined,
            language: language || undefined,
            condition: condition || undefined,
            grade: grade !== "" ? parseFloat(grade) : undefined,
            obtainedAt: obtainedAt || undefined,
            acquisitionPrice:
              acquisitionPrice !== "" ? parseFloat(acquisitionPrice) : undefined,
            acquisitionCurrency:
              acquisitionPrice !== "" ? acquisitionCurrency : undefined,
          },
        ]);
        setFoil(false);
        setLanguage("");
        setCondition("");
        setGrade("");
        setObtainedAt(DateTime.now().toISODate());
        setAcquisitionPrice("");
        setAcquisitionCurrency("EUR");
        setDialogOpen(false);
      }
    } finally {
      setAdding(false);
    }
  }

  async function removeEntry(entryId: string) {
    const res = await fetch(
      `/api/collection/cards/${encodeURIComponent(cardId)}?entryId=${encodeURIComponent(entryId)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    }
  }

  if (loading) {
    return <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{t("cards.collection.label")}</span>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="font-semibold">{entries.length}</span>
          <span className="text-muted-foreground">
            {t("cards.collection.count", { count: entries.length })}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Plus className="h-4 w-4" />
              {t("cards.collection.actions.add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("cards.collection.dialog.title")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="foil"
                  checked={foil}
                  onCheckedChange={(v) => setFoil(!!v)}
                />
                <Label htmlFor="foil">Foil</Label>
              </div>

              <div className="space-y-1">
                <Label htmlFor="language">{t("cards.collection.fields.language")}</Label>
                <div className="flex flex-wrap gap-2">
                  {primaryLanguages.map((option) => (
                    <Button
                      key={option.code}
                      type="button"
                      variant={language === option.code ? "default" : "outline"}
                      size="sm"
                      onClick={() =>
                        setLanguage(language === option.code ? "" : option.code)
                      }
                    >
                      {option.label}
                    </Button>
                  ))}
                  <Select
                    value={secondaryLanguages.some((option) => option.code === language) ? language : ""}
                    onValueChange={(value) => setLanguage(value as LanguageCode)}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder={t("cards.collection.fields.otherLanguages")} />
                    </SelectTrigger>
                    <SelectContent>
                      {secondaryLanguages.map((option) => (
                        <SelectItem key={option.code} value={option.code}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLanguage("")}
                  >
                    {t("cards.collection.fields.none")}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="obtainedAt">{t("cards.collection.fields.obtainedAt")}</Label>
                <Input
                  id="obtainedAt"
                  type="date"
                  value={obtainedAt}
                  onChange={(e) => setObtainedAt(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="acquisitionPrice">{t("cards.collection.fields.acquisitionPrice")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="acquisitionPrice"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="ex: 12.50"
                    value={acquisitionPrice}
                    onChange={(e) => setAcquisitionPrice(e.target.value)}
                    className="flex-1"
                  />
                  <Select
                    value={acquisitionCurrency}
                    onValueChange={(value) => setAcquisitionCurrency(value as CurrencyCode)}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder={t("cards.collection.fields.currency")} />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>{t("cards.collection.fields.condition")}</Label>
                <Select
                  value={condition}
                  onValueChange={(v) => setCondition(v as Condition)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("cards.collection.fields.conditionPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {conditionOptions.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="grade">{t("cards.collection.fields.grade")}</Label>
                <Input
                  id="grade"
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  placeholder="ex: 9.5"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                  {t("cards.collection.actions.cancel")}
                </Button>
                <Button type="button" onClick={addCard} disabled={adding}>
                  {adding ? t("cards.collection.actions.adding") : t("cards.collection.actions.add")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {expanded && (
        <div className="border rounded-lg divide-y">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3">
              {t("cards.collection.empty")}
            </p>
          ) : (
            entries.map((entry, i) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 gap-2"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">#{i + 1}</span>
                  {entry.language && (
                    <Badge variant="secondary">
                      {primaryLanguages.find((option) => option.code === entry.language)?.label ??
                        secondaryLanguages.find((option) => option.code === entry.language)?.label ??
                        entry.language}
                    </Badge>
                  )}
                  {entry.foil && <Badge variant="secondary">{t("cards.collection.badges.foil")}</Badge>}
                  {entry.condition && (
                    <Badge variant="outline">{entry.condition}</Badge>
                  )}
                  {entry.grade !== undefined && (
                    <Badge variant="outline">
                      {t("cards.collection.badges.grade", { grade: entry.grade })}
                    </Badge>
                  )}
                  {entry.obtainedAt && (
                    <Badge variant="outline">
                      {t("cards.collection.badges.obtainedAt", { date: DateTime.fromISO(entry.obtainedAt).setLocale(locale).toLocaleString(DateTime.DATE_FULL) })}
                    </Badge>
                  )}
                  {entry.acquisitionPrice !== undefined && (
                    <Badge variant="outline">
                      {new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", {
                        style: "currency",
                        currency: entry.acquisitionCurrency ?? "EUR",
                      }).format(entry.acquisitionPrice)}
                    </Badge>
                  )}
                  {!entry.foil &&
                    !entry.language &&
                    !entry.condition &&
                    entry.grade === undefined &&
                    entry.obtainedAt === undefined &&
                    entry.acquisitionPrice === undefined && (
                      <span className="text-muted-foreground">{t("cards.collection.badges.standard")}</span>
                    )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                  onClick={() => removeEntry(entry.id)}
                  aria-label={t("cards.collection.actions.remove")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
