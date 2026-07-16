"use client";

import { Languages } from "lucide-react";
import { Locale, localeLabels } from "@/i18n/config";

export default function LanguagePicker({
  availableLangs,
  originalLang,
  value,
  onChange,
  originalLabel = "original",
  ariaLabel = "Language",
}: {
  availableLangs: Locale[];
  originalLang: Locale;
  value: Locale;
  onChange: (lang: Locale) => void;
  originalLabel?: string;
  ariaLabel?: string;
}) {
  const uniqueLangs = [...new Set(availableLangs)];
  if (uniqueLangs.length <= 1) return null;

  return (
    <div className="inline-flex items-center gap-1.5">
      <Languages className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Locale)}
        aria-label={ariaLabel}
        className="text-xs rounded-md border border-input bg-background px-1.5 py-1"
      >
        {uniqueLangs.map((lang) => (
          <option key={lang} value={lang}>
            {localeLabels[lang]}
            {lang === originalLang ? ` · ${originalLabel}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
