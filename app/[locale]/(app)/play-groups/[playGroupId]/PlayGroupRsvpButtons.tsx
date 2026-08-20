"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import type { PlayGroupRsvpAnswer } from "@/lib/types/PlayGroupSession";

import { setPlayGroupRsvp } from "./actions.ts";

const ANSWERS: PlayGroupRsvpAnswer[] = ["yes", "maybe", "no"];

/**
 * Les trois réponses à une session.
 *
 * Exclusives et re-cliquables : recliquer sa propre réponse l'annule, et le
 * membre repasse dans les « choses qui attendent une réponse ». Il n'y a pas de
 * bouton « annuler » à côté — le bouton déjà choisi *est* l'annulation.
 */
export default function PlayGroupRsvpButtons({
  playGroupId,
  sessionId,
  answer,
}: {
  playGroupId: string;
  sessionId: string;
  answer: PlayGroupRsvpAnswer | null;
}) {
  const t = useTranslations("PlayGroups.hub.rsvp");
  const [pending, startTransition] = useTransition();

  const onAnswer = (next: PlayGroupRsvpAnswer) => {
    startTransition(async () => {
      const result = await setPlayGroupRsvp(playGroupId, sessionId, next);
      if (!result.success) {
        toast.error(t("error"));
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ANSWERS.map((value) => (
        <Button
          key={value}
          size="sm"
          variant={answer === value ? "default" : "outline"}
          aria-pressed={answer === value}
          disabled={pending}
          onClick={() => onAnswer(value)}
        >
          {t(value)}
        </Button>
      ))}
    </div>
  );
}
