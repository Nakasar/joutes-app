"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { ArrowLeft, Package, Plus, Trash2, Loader2, PackagePlus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import type { Booster } from "@/lib/types/booster";
import SetCombobox from "./SetCombobox";

const LANG_LABELS: Record<string, string> = {
  en: "🇬🇧 EN", fr: "🇫🇷 FR", it: "🇮🇹 IT", de: "🇩🇪 DE",
  es: "🇪🇸 ES", ja: "🇯🇵 JA", ko: "🇰🇷 KO", zh: "🇨🇳 ZH",
};
function langLabel(code: string): string {
  return LANG_LABELS[code.toLowerCase()] ?? code.toUpperCase();
}

type Props = {
  gameSlug: string;
  gameName: string;
  initialBoosters: Booster[];
  setCodes: string[];
  langs: string[];
};

export default function BoostersList({ gameSlug, gameName, initialBoosters, setCodes, langs }: Props) {
  const t = useTranslations("Collection");
  const locale = useLocale();
  const router = useRouter();

  const [boosters, setBoosters] = useState<Booster[]>(initialBoosters);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [setCode, setSetCode] = useState(setCodes[0] ?? "");
  const [lang, setLang] = useState(langs[0] ?? "en");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const create = async () => {
    if (!setCode || !lang) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/collection/boosters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameSlug, setCode, lang }),
      });
      if (res.ok) {
        const { id } = await res.json();
        router.push(`/collection/${gameSlug}/boosters/${id}`);
      }
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/collection/boosters/${id}`, { method: "DELETE" });
      if (res.ok) {
        setBoosters((prev) => prev.filter((b) => b.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/collection/${gameSlug}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("game.backToCollection", { game: gameName })}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("boosters.title")}</h1>
            <p className="text-muted-foreground">{t("boosters.subtitle", { game: gameName })}</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" />
                {t("boosters.create")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("boosters.createTitle")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>{t("boosters.set")}</Label>
                  <SetCombobox value={setCode} onChange={setSetCode} options={setCodes} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("boosters.language")}</Label>
                  <Select value={lang} onValueChange={setLang}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("boosters.languagePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {langs.map((l) => (
                        <SelectItem key={l} value={l}>
                          {langLabel(l)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  {t("boosters.cancel")}
                </Button>
                <Button onClick={create} disabled={creating || !setCode || !lang}>
                  {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                  {t("boosters.create")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {boosters.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <PackagePlus className="size-10 text-muted-foreground" />
          <div>
            <p className="font-semibold">{t("boosters.emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("boosters.emptyDescription")}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boosters.map((booster) => (
            <div key={booster.id} className="group relative flex flex-col rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
              <Link href={`/collection/${gameSlug}/boosters/${booster.id}`} className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Package className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="font-mono text-[11px]">{booster.setCode}</Badge>
                    <Badge variant="secondary" className="text-[11px]">{langLabel(booster.lang)}</Badge>
                    {booster.addedToCollection ? (
                      <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3" />
                        {t("boosters.inCollection")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-sm font-medium">
                    {t("boosters.cardCount", { count: booster.cards?.length ?? 0 })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {DateTime.fromISO(booster.createdAt).setLocale(locale).toLocaleString(DateTime.DATE_MED)}
                  </p>
                </div>
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-2 top-2 text-destructive opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                disabled={deletingId === booster.id}
                onClick={() => remove(booster.id)}
                aria-label={t("boosters.delete")}
              >
                {deletingId === booster.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
