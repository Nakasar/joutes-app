"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import GameMarkdown from "@/components/GameMarkdown";
import { type ErrataType } from "@/lib/types/errata";
import { useLocale, useTranslations } from "next-intl";

type LoopErrata = {
  id: string;
  type: ErrataType;
  details: string;
  errataDate: string;
  source?: string;
  deprecatedAt?: string;
};

type LoopCard = {
  id: string;
  name: string;
  image: string;
  setCode: string;
  collectorNumber: string;
  type?: string;
  erratas: LoopErrata[];
};

type LoopResult = {
  raw: string;
  annotated: string;
  cards: LoopCard[];
};

const ERRATA_CLASS: Record<ErrataType, string> = {
  errata: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  clarification: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  ruling: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

export default function LoopClient({ gameSlug, ruleLang }: { gameSlug: string; ruleLang: "en" | "fr" }) {
  const t = useTranslations("Games.Loop");
  const locale = useLocale();

  const [text, setText] = useState("");
  const [result, setResult] = useState<LoopResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (value: string) => {
    const parsed = DateTime.fromISO(value);
    return parsed.isValid ? parsed.setLocale(locale).toLocaleString(DateTime.DATE_MED) : value;
  };

  async function analyze() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/games/${gameSlug}/loop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? t("errors.generic"));
      }
      setResult(data as LoopResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }

  const cardsById = Object.fromEntries((result?.cards ?? []).map((c) => [c.id, c]));

  return (
    <div>
      <div className="mb-3">
        <Label htmlFor="loop-text" className="block text-sm font-medium mb-2">
          {t("form.label")}
        </Label>
        <Textarea
          id="loop-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("form.placeholder")}
          className="w-full h-60 p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex flex-row space-x-4">
        <Button onClick={analyze} disabled={isLoading || !text.trim()}>
          {isLoading ? t("form.loading") : t("form.analyze")}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

      {result && (
        <div className="mt-8 space-y-8">
          <div>
            <h2 className="text-lg font-semibold mb-2">{t("results.annotatedTitle")}</h2>
            <div className="prose prose-sm dark:prose-invert max-w-none border rounded-lg p-4 bg-card">
              <GameMarkdown markdown={result.annotated} cardsById={cardsById} gameSlug={gameSlug} ruleLang={ruleLang} />
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">
              {t("results.cardsTitle", { count: result.cards.length })}
            </h2>
            {result.cards.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("results.noCards")}</p>
            ) : (
              <div className="space-y-4">
                {result.cards.map((card) => (
                  <div key={card.id} className="border rounded-lg p-4 bg-card flex gap-4">
                    {card.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.image} alt={card.name} className="w-20 h-auto rounded shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="font-semibold">{card.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {card.setCode} #{card.collectorNumber}
                        </span>
                      </div>
                      {card.erratas.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("results.noErrata")}</p>
                      ) : (
                        <div className="space-y-3">
                          {card.erratas.map((errata) => (
                            <div
                              key={errata.id}
                              className={`border-t pt-3 ${errata.deprecatedAt ? "opacity-50" : ""}`}
                            >
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${ERRATA_CLASS[errata.type]}`}>
                                  {t(`errataTypes.${errata.type}`)}
                                </span>
                                <span className="text-xs text-muted-foreground">{formatDate(errata.errataDate)}</span>
                                {errata.deprecatedAt && (
                                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                                    {t("results.deprecated")}
                                  </span>
                                )}
                              </div>
                              <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                                <GameMarkdown
                                  markdown={errata.details}
                                  cardsById={cardsById}
                                  gameSlug={gameSlug}
                                  ruleLang={ruleLang}
                                />
                              </div>
                              {errata.source && (
                                <a
                                  href={errata.source}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-1 inline-block text-xs text-blue-600 hover:underline"
                                >
                                  {t("results.source")} →
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
