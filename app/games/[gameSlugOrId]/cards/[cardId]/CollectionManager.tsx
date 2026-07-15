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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronDown, ChevronUp, HandHelping, Loader2, Plus, Tag, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "@/lib/auth-client";

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

type ForSaleInfo = {
  itemId: string;
  sellListId: string;
  price?: number;
  currency?: CurrencyCode;
  note?: string;
};

type CollectionEntry = {
  id: string;
  foil?: boolean;
  language?: LanguageCode;
  condition?: Condition;
  grade?: number;
  obtainedAt?: string;
  acquisitionPrice?: number;
  acquisitionCurrency?: CurrencyCode;
  borrowedBy?: string;
  forSale?: ForSaleInfo;
};

type CollectionManagerProps = {
  cardId: string;
  gameSlug: string;
  cardName: string;
  setCode: string;
  collectorNumber: string;
  image: string;
  onChange?: (quantity: number) => void;
  /** API prefix to use for reads/writes — override to manage a play-group's shared collection instead of the current user's. */
  apiBasePath?: string;
  /** Set when managing a play-group's shared collection — enables username autocompletion when marking a card borrowed. */
  playGroupId?: string;
};

export default function CollectionManager({
  cardId,
  gameSlug,
  cardName,
  setCode,
  collectorNumber,
  image,
  onChange,
  apiBasePath = "/api/collection",
  playGroupId,
}: CollectionManagerProps) {
  const sellListApiBasePath = playGroupId ? `/api/play-groups/${playGroupId}/sell-list` : "/api/sell-lists/mine";

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
          `${apiBasePath}/cards/${encodeURIComponent(cardId)}?gameSlug=${encodeURIComponent(gameSlug)}`
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
  }, [cardId, gameSlug, apiBasePath]);

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

      const res = await fetch(`${apiBasePath}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setEntries((prev) => {
          const next = [
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
          ];
          onChange?.(next.length);
          return next;
        });
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
      `${apiBasePath}/cards/${encodeURIComponent(cardId)}?entryId=${encodeURIComponent(entryId)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setEntries((prev) => {
        const next = prev.filter((e) => e.id !== entryId);
        onChange?.(next.length);
        return next;
      });
    }
  }

  async function setBorrowed(entryId: string, borrowedBy: string | null) {
    const res = await fetch(`${apiBasePath}/cards/${encodeURIComponent(cardId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId, borrowedBy }),
    });
    if (res.ok) {
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, borrowedBy: borrowedBy ?? undefined } : e))
      );
    }
  }

  async function listForSale(entryId: string, price: number | undefined, currency: CurrencyCode, note: string) {
    const res = await fetch(`${sellListApiBasePath}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collectionEntryId: entryId,
        gameSlug,
        ...(price !== undefined && { price, currency }),
        ...(note.trim() && { note: note.trim() }),
      }),
    });
    if (res.ok) {
      const item = await res.json();
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? { ...e, forSale: { itemId: item.id, sellListId: item.sellListId, price: item.price, currency: item.currency, note: item.note } }
            : e
        )
      );
      return true;
    }
    return false;
  }

  async function updateSalePrice(entry: CollectionEntry, price: number | undefined, currency: CurrencyCode, note: string) {
    if (!entry.forSale) return false;
    const res = await fetch(`/api/sell-lists/${entry.forSale.sellListId}/items/${entry.forSale.itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        price: price !== undefined ? price : null,
        ...(price !== undefined && { currency }),
        ...(note.trim() && { note: note.trim() }),
      }),
    });
    if (res.ok) {
      const item = await res.json();
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? { ...e, forSale: { itemId: item.id, sellListId: item.sellListId, price: item.price, currency: item.currency, note: item.note } }
            : e
        )
      );
      return true;
    }
    return false;
  }

  async function unlistFromSale(entry: CollectionEntry) {
    if (!entry.forSale) return false;
    const res = await fetch(`/api/sell-lists/${entry.forSale.sellListId}/items/${entry.forSale.itemId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, forSale: undefined } : e)));
      return true;
    }
    return false;
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
                  {entry.borrowedBy && (
                    <Badge className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      <HandHelping className="h-3 w-3" />
                      {t("cards.collection.badges.borrowedBy", { name: entry.borrowedBy })}
                    </Badge>
                  )}
                  {entry.forSale && (
                    <Badge className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                      <Tag className="h-3 w-3" />
                      {entry.forSale.price !== undefined
                        ? t("cards.collection.badges.forSale", {
                            price: new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", {
                              style: "currency",
                              currency: entry.forSale.currency,
                            }).format(entry.forSale.price),
                          })
                        : t("cards.collection.badges.forSaleNoPrice")}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <BorrowPopover
                    entry={entry}
                    playGroupId={playGroupId}
                    onSet={(borrowedBy) => setBorrowed(entry.id, borrowedBy)}
                  />
                  <SellPopover
                    entry={entry}
                    onList={(price, currency, note) =>
                      entry.forSale
                        ? updateSalePrice(entry, price, currency, note)
                        : listForSale(entry.id, price, currency, note)
                    }
                    onUnlist={() => unlistFromSale(entry)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => removeEntry(entry.id)}
                    aria-label={t("cards.collection.actions.remove")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BorrowPopover({
  entry,
  playGroupId,
  onSet,
}: {
  entry: CollectionEntry;
  playGroupId?: string;
  onSet: (borrowedBy: string | null) => Promise<void> | void;
}) {
  const t = useTranslations("Games");
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(entry.borrowedBy ?? "");
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<string[] | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const myName = session?.user?.name || session?.user?.email || "";

  async function loadMembers() {
    if (!playGroupId || members !== null) return;
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/play-groups/${playGroupId}/members`);
      if (res.ok) {
        const data = await res.json();
        type MemberWithUser = { user: { username?: string } | null };
        const usernames = ((data.members ?? []) as MemberWithUser[])
          .map((m) => m.user?.username)
          .filter((u): u is string => !!u);
        setMembers(usernames);
      }
    } finally {
      setLoadingMembers(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setValue(entry.borrowedBy ?? "");
      void loadMembers();
    }
  }

  async function handleSave(next: string) {
    const trimmed = next.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSet(trimmed);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await onSet(null);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 shrink-0 ${entry.borrowedBy ? "text-amber-600 hover:text-amber-600" : ""}`}
          aria-label={t("cards.collection.actions.markBorrowed")}
          title={t("cards.collection.actions.markBorrowed")}
        >
          <HandHelping className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <p className="text-sm font-medium">{t("cards.collection.borrow.title")}</p>
          <div className="flex gap-1.5">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("cards.collection.borrow.placeholder")}
              className="h-8"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave(value);
                }
              }}
            />
            {myName && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                disabled={saving}
                onClick={() => setValue(myName)}
              >
                {t("cards.collection.borrow.me")}
              </Button>
            )}
          </div>
          {playGroupId && (
            <div className="max-h-32 overflow-y-auto rounded-md border">
              <Command>
                <CommandList>
                  {loadingMembers ? (
                    <div className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      {t("cards.collection.borrow.loadingMembers")}
                    </div>
                  ) : (
                    <>
                      <CommandEmpty className="p-3 text-xs text-muted-foreground">
                        {t("cards.collection.borrow.noMembers")}
                      </CommandEmpty>
                      <CommandGroup>
                        {(members ?? []).map((username) => (
                          <CommandItem key={username} value={username} onSelect={() => setValue(username)}>
                            {username}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </div>
          )}
          <div className="flex justify-end gap-2">
            {entry.borrowedBy && (
              <Button type="button" variant="ghost" size="sm" className="gap-1" disabled={saving} onClick={handleClear}>
                <X className="size-3.5" />
                {t("cards.collection.borrow.clear")}
              </Button>
            )}
            <Button type="button" size="sm" disabled={saving || !value.trim()} onClick={() => handleSave(value)}>
              {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              {t("cards.collection.borrow.save")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SellPopover({
  entry,
  onList,
  onUnlist,
}: {
  entry: CollectionEntry;
  onList: (price: number | undefined, currency: CurrencyCode, note: string) => Promise<boolean> | boolean;
  onUnlist: () => Promise<boolean> | boolean;
}) {
  const t = useTranslations("Games");
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(entry.forSale?.price !== undefined ? String(entry.forSale.price) : "");
  const [currency, setCurrency] = useState<CurrencyCode>(entry.forSale?.currency ?? "EUR");
  const [note, setNote] = useState(entry.forSale?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setPrice(entry.forSale?.price !== undefined ? String(entry.forSale.price) : "");
      setCurrency(entry.forSale?.currency ?? "EUR");
      setNote(entry.forSale?.note ?? "");
      setError(null);
    }
  }

  async function handleList() {
    const trimmedPrice = price.trim();
    let parsedPrice: number | undefined;
    if (trimmedPrice) {
      parsedPrice = parseFloat(trimmedPrice);
      if (isNaN(parsedPrice) || parsedPrice < 0) return;
    }
    setSaving(true);
    setError(null);
    try {
      const ok = await onList(parsedPrice, currency, note);
      if (ok) {
        setOpen(false);
      } else {
        setError(t("cards.collection.sell.error"));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlist() {
    setSaving(true);
    setError(null);
    try {
      const ok = await onUnlist();
      if (ok) {
        setOpen(false);
      } else {
        setError(t("cards.collection.sell.error"));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 shrink-0 ${entry.forSale ? "text-emerald-600 hover:text-emerald-600" : ""}`}
          aria-label={t("cards.collection.actions.sell")}
          title={t("cards.collection.actions.sell")}
        >
          <Tag className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <p className="text-sm font-medium">{t("cards.collection.sell.title")}</p>
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder={t("cards.collection.sell.price")}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-8 flex-1"
            />
            <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
              <SelectTrigger className="h-8 w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("cards.collection.sell.note")}
            className="h-8"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            {entry.forSale && (
              <Button type="button" variant="ghost" size="sm" className="gap-1" disabled={saving} onClick={handleUnlist}>
                <X className="size-3.5" />
                {t("cards.collection.actions.unlist")}
              </Button>
            )}
            <Button type="button" size="sm" disabled={saving} onClick={handleList}>
              {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              {entry.forSale ? t("cards.collection.sell.update") : t("cards.collection.sell.submit")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
