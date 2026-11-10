"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation.ts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";

import { viewHref } from "../views.ts";

type Option = { value: string; label: string };

/** `Select` refuse une valeur vide : « tous » a la sienne. */
const ALL = "__all";

/** Le filtre par membre de la méta : il réécrit l'adresse, onglet et période compris. */
export function MetaMemberSelect({
  playGroupId,
  params,
  members,
}: {
  playGroupId: string;
  params: Record<string, string | undefined>;
  members: Option[];
}) {
  const t = useTranslations("PlayGroups.hub.meta");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (membre: string | undefined) => {
    startTransition(() => {
      router.replace(viewHref(playGroupId, "meta", { filters: { ...params, membre } }), { scroll: false });
    });
  };

  return (
    <Select value={params.membre ?? ALL} onValueChange={(value) => go(value === ALL ? undefined : value)}>
      <SelectTrigger className="min-w-[180px]" aria-label={t("memberFilter")} aria-busy={pending}>
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
  );
}
