"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation.ts";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";

import { viewHref } from "../views.ts";

type Option = { value: string; label: string };

/** `Select` refuse une valeur vide : « tous » a la sienne. */
const ALL = "__all";

/**
 * Membre, légende, top 8 : les filtres de la timeline qui ne tiennent pas en
 * pastilles. Chacun réécrit l'adresse et ramène au mois le plus récent.
 */
export function TournamentFilterBar({
  playGroupId,
  params,
  members,
  legends,
}: {
  playGroupId: string;
  params: Record<string, string | undefined>;
  members: Option[];
  legends: Option[];
}) {
  const t = useTranslations("PlayGroups.hub.tournaments");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (patch: Record<string, string | undefined>) => {
    startTransition(() => {
      router.replace(viewHref(playGroupId, "tournaments", { filters: { ...params, avant: undefined, ...patch } }), {
        scroll: false,
      });
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      {members.length > 1 && (
        <Select value={params.membre ?? ALL} onValueChange={(value) => go({ membre: value === ALL ? undefined : value })}>
          <SelectTrigger className="min-w-[180px]" aria-label={t("memberFilter")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allMembers")}</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.value} value={member.value}>
                {member.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {legends.length > 0 && (
        <Select value={params.legende ?? ALL} onValueChange={(value) => go({ legende: value === ALL ? undefined : value })}>
          <SelectTrigger className="min-w-[180px]" aria-label={t("legendFilter")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allLegends")}</SelectItem>
            {legends.map((legend) => (
              <SelectItem key={legend.value} value={legend.value}>
                {legend.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-[13px] font-normal">
        <Checkbox
          checked={params.top8 === "1"}
          onCheckedChange={(checked) => go({ top8: checked === true ? "1" : undefined })}
        />
        {t("topEightOnly")}
      </Label>
    </div>
  );
}
