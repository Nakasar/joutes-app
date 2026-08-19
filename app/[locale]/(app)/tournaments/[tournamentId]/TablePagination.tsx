"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button.tsx";

type Props = {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
};

// Barre de pagination : nombre de résultats + navigation page précédente /
// suivante. Toujours affichée pour rappeler le total, même sur une seule page.
export function TablePagination({ page, totalPages, total, onPage }: Props) {
  const t = useTranslations("Tournaments");
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
      <span className="text-xs text-muted-foreground">{t("pagination.results", { count: total })}</span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>
            {t("pagination.previous")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("pagination.pageOf", { page: page + 1, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => onPage(page + 1)}
          >
            {t("pagination.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
