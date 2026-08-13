'use client';

import {Field, FieldContent, FieldDescription, FieldLabel, FieldTitle} from "@/components/ui/field";
import {Switch} from "@/components/ui/switch";
import {ReactNode, useState} from "react";
import {updateNotificationsPreference} from "@/app/account/actions";
import type {NotificationChannel, NotificationPreferenceType} from "@/lib/notifications/preferences";

export function NotificationPreferenceSwitch({ type, channel, label, icon, description, initialEnabled, disabled = false }: {
  type: NotificationPreferenceType;
  channel: NotificationChannel;
  label: string;
  icon: ReactNode;
  description: string;
  initialEnabled: boolean;
  disabled?: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpdate() {
    const next = !enabled;

    // Bascule d'abord — l'interrupteur doit répondre au doigt —, mais on
    // revient en arrière si le serveur refuse. Sans ce retour, un échec
    // laissait l'interface affirmer un réglage qui n'avait pas été enregistré.
    setEnabled(next);
    setPending(true);
    setError(null);

    try {
      const result = await updateNotificationsPreference(type, channel, next);
      if (!result.success) {
        setEnabled(!next);
        setError(result.error ?? "Réglage non enregistré.");
      }
    } catch {
      setEnabled(!next);
      setError("Réglage non enregistré.");
    } finally {
      setPending(false);
    }
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
          {error && <FieldDescription className="text-destructive">{error}</FieldDescription>}
        </FieldContent>
        <Switch id={`switch-${type}-${channel}`} checked={enabled} onCheckedChange={handleUpdate} disabled={disabled || pending} />
      </Field>
    </FieldLabel>
  );
}
