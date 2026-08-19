"use client";

import { ReactNode, useEffect } from "react";
import { Link } from "@/i18n/navigation.ts";
import { useTranslations } from "next-intl";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

/**
 * Cadre commun aux pages destinées au papier (feuilles de match, liste des
 * matchs).
 *
 * Sur écran, c'est une surcouche plein écran qui recouvre le chrome du site,
 * comme la page minuteur ; à l'impression, `data-print-page` la remet dans le
 * flux (une boîte `fixed` ne sortirait que sur la première page) et la barre
 * d'actions disparaît. Les couleurs sont figées en noir sur blanc, quel que
 * soit le thème de l'utilisateur.
 */
export function PrintShell({
  title,
  subtitle,
  backHref,
  children,
}: {
  title: string;
  subtitle: string;
  backHref: string;
  children: ReactNode;
}) {
  const t = useTranslations("Tournaments");

  // L'aperçu d'impression s'ouvre de lui-même : la page n'a pas d'autre usage.
  // Le court délai laisse la mise en page se stabiliser avant le rendu papier.
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div data-print-page className="fixed inset-0 z-[100] overflow-auto bg-white p-6 text-black">
      <div
        data-print-hidden
        className="mx-auto mb-6 flex max-w-[210mm] flex-wrap items-start justify-between gap-3"
      >
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-neutral-600">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={backHref}>
              <ArrowLeft className="size-4" />
              {t("matchExport.back")}
            </Link>
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" />
            {t("matchExport.print")}
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[210mm]">{children}</div>
    </div>
  );
}
