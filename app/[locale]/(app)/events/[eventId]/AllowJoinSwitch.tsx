"use client";

import { Switch } from "@/components/ui/switch.tsx";
import { useState } from "react";
import { toggleAllowJoinAction } from "../actions.ts";
import { useRouter } from "@/i18n/navigation.ts";
import { useTranslations } from "next-intl";

type AllowJoinSwitchProps = {
  eventId: string;
  initialAllowJoin: boolean;
};

export default function AllowJoinSwitch({ eventId, initialAllowJoin }: AllowJoinSwitchProps) {
  const [allowJoin, setAllowJoin] = useState(initialAllowJoin);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations("EventDetail.manage");

  const handleToggle = async (checked: boolean) => {
    setIsLoading(true);
    setAllowJoin(checked);

    const result = await toggleAllowJoinAction(eventId, checked);

    if (!result.success) {
      // En cas d'erreur, revenir à l'état précédent
      setAllowJoin(!checked);
      alert(result.error);
    } else {
      router.refresh();
    }

    setIsLoading(false);
  };

  return (
    <div className="flex items-center gap-3">
      <Switch
        id="allow-join"
        checked={allowJoin}
        onCheckedChange={handleToggle}
        disabled={isLoading}
      />
      <div>
        <label htmlFor="allow-join" className="block text-sm font-semibold">
          {t("allowJoin")}
        </label>
        <p className="text-xs text-muted-foreground">{t("allowJoinHelp")}</p>
      </div>
    </div>
  );
}
