"use client";

import { useState } from "react";
import { updateProfileVisibilityAction } from "./user-actions";
import { Globe, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface ProfileVisibilitySwitchProps {
  initialIsPublic: boolean;
  userTag?: string;
}

export default function ProfileVisibilitySwitch({ 
  initialIsPublic, 
  userTag 
}: ProfileVisibilitySwitchProps) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (checked: boolean) => {
    setIsLoading(true);

    const result = await updateProfileVisibilityAction(checked);

    if (result.success) {
      setIsPublic(checked);
    }

    setIsLoading(false);
  };

  return (
    <div className="flex items-center gap-3">
      {isPublic ? (
        <Globe className="h-5 w-5 text-green-600" />
      ) : (
        <Lock className="h-5 w-5 text-muted-foreground" />
      )}
      <div className="flex flex-col">
        <span className="text-sm font-medium">
          Profil {isPublic ? "public" : "privé"}
        </span>
        <span className="text-xs text-muted-foreground">
          {isPublic ? "Visible par tous" : "Informations limitées"}
        </span>
      </div>
      <Switch
        checked={isPublic}
        onCheckedChange={handleToggle}
        disabled={isLoading}
      />
    </div>
  );
}
