"use client";

import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";

import type { UserShowcaseSection } from "@/lib/users/showcase.ts";

/**
 * « Vu par un inconnu ».
 *
 * Une miniature **dessinée**, et non une `iframe` de la vraie page : charger la
 * vitrine complète dans un cadre de 220 px coûterait un rendu entier pour
 * montrer trois barres de couleur. Ce qu'il faut voir ici, c'est l'effet de la
 * bannière et l'ordre des blocs — c'est exactement ce que la miniature rend, et
 * elle le rend **en direct**, sur ce qui n'est pas encore enregistré.
 */
export default function ShowcasePreview({
  isPublic,
  banner,
  avatar,
  sections,
}: {
  isPublic: boolean;
  banner?: string;
  avatar?: string;
  sections: UserShowcaseSection[];
}) {
  const t = useTranslations("Account.showcase.preview");
  const enabled = sections.filter((section) => section.enabled);

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="text-sm font-semibold">{t("title")}</h2>

      <div className="overflow-hidden rounded-lg border bg-background">
        <div className="relative h-12 w-full bg-muted">
          {banner && (
            // Aperçu local d'une image déjà déposée : hôte non déclaré.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner} alt="" className="h-full w-full object-cover" />
          )}
        </div>

        <div className="-mt-4 flex items-end gap-2 px-2.5">
          <span className="size-8 shrink-0 overflow-hidden rounded-full border-2 border-background bg-muted">
            {avatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            )}
          </span>
          <span className="mb-1 h-2 w-20 rounded-full bg-muted" />
        </div>

        {isPublic ? (
          <>
            <div className="mt-2 flex gap-1.5 border-b px-2.5 pb-2">
              {enabled.slice(0, 4).map((section, index) => (
                <span
                  key={section.key}
                  className={`h-1 flex-1 rounded-full ${index === 0 ? "bg-primary" : "bg-muted"}`}
                />
              ))}
            </div>

            <ul className="flex flex-col gap-1.5 p-2.5">
              {enabled.map((section) => (
                <li
                  key={section.key}
                  className="rounded border bg-card px-2 py-1.5 text-[9px] text-muted-foreground"
                >
                  {t(`sections.${section.key}` as "sections.about")}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5 p-5 text-center">
            <Lock className="size-4 text-muted-foreground" aria-hidden />
            <p className="text-[10px] text-muted-foreground">{t("privateNotice")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
