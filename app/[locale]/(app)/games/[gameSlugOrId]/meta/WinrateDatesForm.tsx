"use client";

import { useState } from "react";

import { useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

/** Les dates choisies des winrates : la page se recharge sur la nouvelle période. */
export function WinrateDatesForm({
  href,
  from,
  to,
  labels,
}: {
  /** L'adresse de l'onglet, sans les dates. */
  href: string;
  from?: string;
  to?: string;
  labels: { from: string; to: string; apply: string };
}) {
  const router = useRouter();
  const [start, setStart] = useState(from ?? "");
  const [end, setEnd] = useState(to ?? "");

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams();
        if (start) params.set("du", start);
        if (end) params.set("au", end);
        const query = params.toString();
        router.push(query ? `${href}&${query}` : href, { scroll: false });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="winrate-from">{labels.from}</Label>
        <Input id="winrate-from" type="date" value={start} max={end || undefined} onChange={(event) => setStart(event.target.value)} className="w-44" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="winrate-to">{labels.to}</Label>
        <Input id="winrate-to" type="date" value={end} min={start || undefined} onChange={(event) => setEnd(event.target.value)} className="w-44" />
      </div>
      <Button type="submit" variant="outline">
        {labels.apply}
      </Button>
    </form>
  );
}
