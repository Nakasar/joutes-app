'use client';

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Button } from "@/components/ui/button.tsx";
import { updateWeeklyEmailOptionsAction } from "@/app/[locale]/(app)/account/actions.ts";
import {
  WEEKLY_EMAIL_SECTIONS,
  type WeeklyEmailSection,
  type WeeklyEmailSettings,
} from "@/lib/notifications/weekly-email.ts";

/**
 * Les sections de l'email hebdomadaire, et l'envoi des semaines vides.
 *
 * Comme le choix des affiches : la sélection se garde côté client jusqu'à
 * « Enregistrer », et le serveur rend les réglages réellement retenus.
 */
export function WeeklyEmailSectionsPicker({ initial }: { initial: WeeklyEmailSettings }) {
  const t = useTranslations("Account.notifications.weekly.email");
  const [selected, setSelected] = useState<WeeklyEmailSection[]>(initial.sections);
  const [skipEmpty, setSkipEmpty] = useState(initial.skipEmpty);
  const [saved, setSaved] = useState<WeeklyEmailSettings>(initial);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const dirty =
    skipEmpty !== saved.skipEmpty ||
    selected.length !== saved.sections.length ||
    selected.some((section) => !saved.sections.includes(section));

  const toggle = (section: WeeklyEmailSection, checked: boolean) => {
    setMessage(null);
    setSelected((current) =>
      WEEKLY_EMAIL_SECTIONS.filter((key) => (key === section ? checked : current.includes(key))),
    );
  };

  const save = () => {
    startTransition(async () => {
      const result = await updateWeeklyEmailOptionsAction({ sections: selected, skipEmpty });
      if (result.success && result.settings) {
        setSelected(result.settings.sections);
        setSkipEmpty(result.settings.skipEmpty);
        setSaved(result.settings);
        setMessage({ kind: "ok", text: t("saved") });
      } else {
        setMessage({ kind: "error", text: result.error ?? t("error") });
      }
    });
  };

  return (
    <div className="space-y-5 border-t pt-5">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{t("title")}</h3>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {WEEKLY_EMAIL_SECTIONS.map((section) => {
          const id = `weekly-email-${section}`;
          return (
            <li key={section}>
              <label htmlFor={id} className="flex h-full cursor-pointer items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  id={id}
                  checked={selected.includes(section)}
                  disabled={isPending}
                  onCheckedChange={(value) => toggle(section, value === true)}
                  className="mt-0.5"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">{t(`sections.${section}.label`)}</span>
                  <span className="block text-xs text-muted-foreground">{t(`sections.${section}.description`)}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t("sending")}</h3>
        <label htmlFor="weekly-email-skip-empty" className="flex cursor-pointer items-start gap-3">
          <Checkbox
            id="weekly-email-skip-empty"
            checked={skipEmpty}
            disabled={isPending}
            onCheckedChange={(value) => {
              setMessage(null);
              setSkipEmpty(value === true);
            }}
            className="mt-0.5"
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">{t("skipEmpty")}</span>
            <span className="block text-xs text-muted-foreground">{t("skipEmptyHint")}</span>
          </span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={save} disabled={!dirty || isPending}>
          {t("save")}
        </Button>
        {/* Une route, pas un lien de navigation : l'aperçu est le HTML du courriel. */}
        <a href="/api/users/me/weekly-email/preview" target="_blank" rel="noopener" className="text-sm font-medium text-primary hover:underline">
          {t("preview")}
        </a>
        {message && (
          <p className={message.kind === "ok" ? "text-sm text-muted-foreground" : "text-sm text-destructive"} role="status">
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
