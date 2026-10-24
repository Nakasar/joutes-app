"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils";

/**
 * Les pages d'une liste d'inscrits : précédente, numéros, suivante. Au-delà de
 * sept pages, seuls la première, la dernière et les voisines de la page
 * courante sont proposées.
 */
export default function ListPagination({
  page,
  pageCount,
  onPageChange,
  disabled,
}: {
  /** Page courante, à partir de 0. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("EventDetail.pagination");
  if (pageCount <= 1) return null;

  const pages = pageCount <= 7
    ? Array.from({ length: pageCount }, (_, i) => i)
    : [...new Set([0, page - 1, page, page + 1, pageCount - 1])]
        .filter((i) => i >= 0 && i < pageCount)
        .sort((a, b) => a - b);

  return (
    <nav aria-label={t("label")} className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={t("previous")}
        disabled={disabled || page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {pages.map((index, position) => (
        <span key={index} className="flex items-center gap-1">
          {position > 0 && index - pages[position - 1] > 1 && (
            <span aria-hidden className="px-1 text-muted-foreground">…</span>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-current={index === page ? "page" : undefined}
            aria-label={t("page", { page: index + 1 })}
            disabled={disabled}
            onClick={() => onPageChange(index)}
            className={cn("tabular-nums", index === page && "border-primary bg-primary/10 text-primary")}
          >
            {index + 1}
          </Button>
        </span>
      ))}
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={t("next")}
        disabled={disabled || page >= pageCount - 1}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}
