"use client";

import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { togglePreRegistrationAction } from "../actions";
import { useRouter } from "next/navigation";

type PreRegistrationSwitchProps = {
  eventId: string;
  initialPreRegistration: boolean;
};

export default function PreRegistrationSwitch({ eventId, initialPreRegistration }: PreRegistrationSwitchProps) {
  const [preRegistration, setPreRegistration] = useState(initialPreRegistration);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

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
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="space-y-0.5">
        <label htmlFor="pre-registration" className="text-sm font-medium">
          Pré-inscription
        </label>
        <p className="text-sm text-muted-foreground">
          Les nouveaux inscrits doivent être validés par l&apos;organisateur
        </p>
      </div>
      <Switch
        id="pre-registration"
        checked={preRegistration}
        onCheckedChange={handleToggle}
        disabled={isLoading}
      />
    </div>
  );
}
