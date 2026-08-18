import { Link } from "@/i18n/navigation";
import { Languages } from "lucide-react";
import { localeLabels, type Locale } from "@/i18n/config";

/**
 * Les langues dans lesquelles l'actualité se lit, en liens plutôt qu'en
 * sélecteur.
 *
 * Chaque version a son adresse : elle se partage, se met en signet et
 * s'indexe. Un `<select>` côté navigateur, comme celui des politiques et des
 * quizz, laisserait tout le monde sur la même URL — ce qui est justement ce
 * que `/news/:id/:lang` défait.
 */
export default function NewsLanguageLinks({
  newsId,
  availableLangs,
  originalLang,
  current,
}: {
  newsId: string;
  availableLangs: Locale[];
  originalLang: Locale;
  current: Locale;
}) {
  if (availableLangs.length <= 1) return null;

  return (
    <nav aria-label="Langues de cette actualité" className="flex flex-wrap items-center gap-2 text-xs">
      <Languages className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {availableLangs.map((lang) => {
        const href = lang === originalLang ? `/news/${newsId}` : `/news/${newsId}/${lang}`;
        const isCurrent = lang === current;

        return (
          <Link
            key={lang}
            href={href}
            hrefLang={lang}
            lang={lang}
            aria-current={isCurrent ? "page" : undefined}
            className={
              isCurrent
                ? "rounded-md border border-primary bg-primary/10 px-2 py-0.5 font-medium text-foreground"
                : "rounded-md border px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            }
          >
            {localeLabels[lang]}
            {lang === originalLang && <span className="ml-1 text-muted-foreground">· VO</span>}
          </Link>
        );
      })}
    </nav>
  );
}
