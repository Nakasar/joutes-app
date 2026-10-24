"use client";

import { Switch } from "@/components/ui/switch.tsx";
import { useState } from "react";
import { togglePreRegistrationAction } from "../actions.ts";
import { useRouter } from "@/i18n/navigation.ts";
import { useTranslations } from "next-intl";

type PreRegistrationSwitchProps = {
  eventId: string;
  initialPreRegistration: boolean;
};

export default function PreRegistrationSwitch({ eventId, initialPreRegistration }: PreRegistrationSwitchProps) {
  const [preRegistration, setPreRegistration] = useState(initialPreRegistration);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations("EventDetail.manage");

  const handleToggle = async (checked: boolean) => {
    setIsLoading(true);
    setPreRegistration(checked);

    const result = await togglePreRegistrationAction(eventId, checked);

    if (!result.success) {
      setPreRegistration(!checked);
      alert(result.error);
    } else {
      router.refresh();
    }

    setIsLoading(false);
  };

  return (
    <div className="flex items-center gap-3">
      <Switch
        id="pre-registration"
        checked={preRegistration}
        onCheckedChange={handleToggle}
        disabled={isLoading}
      />
      <div>
        <label htmlFor="pre-registration" className="block text-sm font-semibold">
          {t("preRegistration")}
        </label>
        <p className="text-xs text-muted-foreground">{t("preRegistrationHelp")}</p>
      </div>
    </div>
  );
}
