"use client";

import { Link } from "@/i18n/navigation";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { localeLabels, type Locale } from "@/i18n/config";

/**
 * Langues dans lesquelles traduire l'actualité. La VO n'y figure pas — elle
 * n'est pas une traduction —, et celles déjà commencées sont annoncées comme
 * telles.
 */
export default function NewsTranslateMenu({
  newsId,
  originalLang,
  translatedLangs,
  allLangs,
}: {
  newsId: string;
  originalLang: Locale;
  translatedLangs: Locale[];
  allLangs: Locale[];
}) {
  const targets = allLangs.filter((lang) => lang !== originalLang);
  if (targets.length === 0) return null;

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
            <Link href={`/news/${newsId}/translate/${lang}`}>
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
