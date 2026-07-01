'use client';

import {Field, FieldContent, FieldDescription, FieldLabel, FieldTitle} from "@/components/ui/field";
import {Switch} from "@/components/ui/switch";
import {ReactNode, useState} from "react";
import {updateNotificationsPreference} from "@/app/account/actions";

export function NotificationPreferenceSwitch({ type, channel, label, icon, description, initialEnabled, disabled = false }: {
  type: "weekly" | "platform";
  channel: "emails" | "app";
  label: string;
  icon: ReactNode;
  description: string;
  initialEnabled: boolean;
  disabled?: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);

  async function handleUpdate() {
    console.log('clicked');
    await updateNotificationsPreference(
      type,
      channel,
      !enabled,
    );
    setEnabled(!enabled);
  }

  return (
    <FieldLabel htmlFor={`switch-${type}-${channel}`}>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldTitle>
            {icon}
            {label}
          </FieldTitle>
          <FieldDescription>
            {description}
          </FieldDescription>
        </FieldContent>
        <Switch id={`switch-${type}-${channel}`} checked={enabled} onCheckedChange={handleUpdate} disabled={disabled} />
      </Field>
    </FieldLabel>
  );
}