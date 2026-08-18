"use client";

import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toggleAllowJoinAction } from "../actions";
import { useRouter } from "next/navigation";

type AllowJoinSwitchProps = {
  eventId: string;
  initialAllowJoin: boolean;
};

export default function AllowJoinSwitch({ eventId, initialAllowJoin }: AllowJoinSwitchProps) {
  const [allowJoin, setAllowJoin] = useState(initialAllowJoin);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

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
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="space-y-0.5">
        <label htmlFor="allow-join" className="text-sm font-medium">
          Inscriptions ouvertes
        </label>
        <p className="text-sm text-muted-foreground">
          Autorise les utilisateurs à s&apos;inscrire à l&apos;événement
        </p>
      </div>
      <Switch
        id="allow-join"
        checked={allowJoin}
        onCheckedChange={handleToggle}
        disabled={isLoading}
      />
    </div>
  );
}
