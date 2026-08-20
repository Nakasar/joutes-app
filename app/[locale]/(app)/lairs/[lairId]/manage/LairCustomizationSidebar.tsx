import { getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { readLairAccent } from "@/lib/lairs/theme.ts";
import { readLairSections } from "@/lib/lairs/sections.ts";
import type { Lair } from "@/lib/types/Lair";

/**
 * La colonne de droite de l'onglet « Personnalisation ».
 *
 * L'aperçu est une miniature dessinée, non une `iframe` de la vraie page :
 * charger la vitrine complète dans un cadre de 220 px coûterait un rendu
 * entier pour montrer trois barres de couleur. Ce qu'il faut voir ici, c'est
 * l'effet de l'accent et l'ordre des sections — c'est exactement ce que la
 * miniature rend.
 */
export default async function LairCustomizationSidebar({
  lair,
  isPro,
}: {
  lair: Lair;
  isPro: boolean;
}) {
  const t = await getTranslations("Lairs.manage.customization");
  const accent = readLairAccent(lair);
  const sections = readLairSections(lair).filter((section) => section.enabled);

  return (
    <div className="flex flex-col gap-4">
      <section
        className="flex flex-col gap-3 rounded-xl border p-4"
        style={{ ...accent.style, borderColor: accent.color ?? undefined }}
      >
        <h3 className="text-sm font-semibold">{t("preview.title")}</h3>

        <div className="overflow-hidden rounded-lg border bg-background">
          <div
            className="h-12 w-full"
            style={{
              background: accent.color
                ? `linear-gradient(120deg, ${accent.color}55, ${accent.color}18)`
                : "var(--muted)",
            }}
          />
          <div className="flex items-center gap-2 border-b px-2.5 py-2">
            <span
              className="size-4 shrink-0 rounded"
              style={{ backgroundColor: accent.color ?? "var(--muted-foreground)" }}
            />
            <span className="truncate text-[11px] font-semibold">{lair.name}</span>
          </div>
          <div className="flex gap-1.5 px-2.5 py-2">
            {sections.slice(0, 4).map((section, index) => (
              <span
                key={section.key}
                className="h-1 flex-1 rounded-full"
                style={{
                  backgroundColor:
                    index === 0 ? (accent.color ?? "var(--primary)") : "var(--muted)",
                }}
              />
            ))}
          </div>
          <div className="flex flex-col gap-1.5 p-2.5 pt-0.5">
            {sections.slice(0, 3).map((section) => (
              <div
                key={section.key}
                className="rounded border bg-card px-2 py-1.5 text-[9px] text-muted-foreground"
              >
                {t(`sections.labels.${section.key}`)}
              </div>
            ))}
          </div>
        </div>

        <Link
          href={`/lairs/${lair.id}`}
          className="text-[13px] hover:underline"
          style={{ color: accent.color ?? undefined }}
        >
          {t("preview.viewPublic")}
        </Link>
      </section>

      {!isPro && (
        <section className="flex flex-col gap-2 rounded-xl border p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="size-3.5 shrink-0" aria-hidden />
            {t("pro.title")}
          </h3>
          <p className="text-[13px] leading-[1.5] text-pretty text-muted-foreground">
            {t("pro.description")}
          </p>
          <Link href="/account/subscription" className="text-[13px] text-primary hover:underline">
            {t("pro.manage")}
          </Link>
        </section>
      )}
    </div>
  );
}
