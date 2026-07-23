"use client";

import { Button } from "@/components/ui/button";

type Props = {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
};

// Barre de pagination : nombre de résultats + navigation page précédente /
// suivante. Toujours affichée pour rappeler le total, même sur une seule page.
export function TablePagination({ page, totalPages, total, onPage }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
      <span className="text-xs text-muted-foreground">{total} résultat(s)</span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>
            Précédent
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => onPage(page + 1)}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  );
}
