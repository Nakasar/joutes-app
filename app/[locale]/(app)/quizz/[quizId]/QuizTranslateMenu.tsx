"use client";

import { Link } from "@/i18n/navigation.ts";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { locales, localeLabels, type Locale } from "@/i18n/config.ts";

/**
 * Langues dans lesquelles traduire le quizz. La langue d'origine n'y figure
 * pas — elle n'est pas une traduction —, et celles déjà commencées sont
 * annoncées comme telles.
 */
export default function QuizTranslateMenu({
  quizId,
  originalLang,
  translatedLangs,
}: {
  quizId: string;
  originalLang: Locale;
  translatedLangs: Locale[];
}) {
  const targets = locales.filter((lang) => lang !== originalLang);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Languages className="h-4 w-4 mr-2" />
          Traduire
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {targets.map((lang) => (
          <DropdownMenuItem key={lang} asChild>
            <Link href={`/quizz/${quizId}/translate/${lang}`}>
              {localeLabels[lang]}
              {translatedLangs.includes(lang) && (
                <span className="ml-2 text-xs text-muted-foreground">commencée</span>
              )}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
